const marklogic = require('marklogic');
const qb = marklogic.queryBuilder;
const schemaHelper = require('./schemaHelper');
let _;
const { dependencies } = require('./appDependencies');
const { getDBPropertiesConfig } = require('./dbPropertiesHelper');

const DOCUMENTS_ORGANIZING_COLLECTIONS = 'collections';
const DOCUMENTS_ORGANIZING_DIRECTORIES = 'directories';

let dbClient = null;
let documentOrganizingType = null;

const setDependencies = ({ lodash }) => _ = lodash;

const getDBClient = (connectionInfo) => {
	if (!dbClient) {
		dbClient = marklogic.createDatabaseClient({
			host: connectionInfo.host,
			port: connectionInfo.port,
			user: connectionInfo.username,
			password: connectionInfo.password,
			...(connectionInfo.database && { database: connectionInfo.database }),
		});
	}
	return dbClient;
}

const releaseDBClient = () => {
	if (dbClient) {
		dbClient.release();
		dbClient = null;
	}
	documentOrganizingType = null;
}

const getDBCollections = async (dbClient) => {
	const getAllCollectionsXQuery = 'fn:distinct-values(for $c in for $d in xdmp:directory("/", "infinity") return xdmp:document-get-collections(xdmp:node-uri($d)) return $c)';
	const response = await dbClient.xqueryEval(getAllCollectionsXQuery).result();
	return Array.isArray(response) ? response.map(({ value }) => value) : [];
}

const getDBDirectories = async (dbClient) => {
	const getAllDirectoriesXQuery = 'fn:distinct-values(for $d in xdmp:directory("/", "infinity") return fn:replace(xdmp:node-uri($d), "[^/]+$", ""))';
	const response = await dbClient.xqueryEval(getAllDirectoriesXQuery).result();
	return Array.isArray(response) ? response.map(({ value }) => value) : [];
}

const getDocumentOrganizingType = async (dbClient = null) => {
	if (documentOrganizingType) {
		return documentOrganizingType;
	}
	if (dbClient) {
		const dbCollections = await getDBCollections(dbClient);
		if (dbCollections.length > 0) {
			documentOrganizingType = DOCUMENTS_ORGANIZING_COLLECTIONS; 
		} else {
			documentOrganizingType = DOCUMENTS_ORGANIZING_DIRECTORIES; 
		}
	}
	return documentOrganizingType;
}

const getCollectionDocuments = async (collectionName, dbClient, recordSamplingSettings) => {
	const documents = await dbClient.documents.query(
		qb.where(
			qb.collection(collectionName)
		).slice(0, +recordSamplingSettings.absolute.value)
	).result();
	return documents.map(({ uri, format, content }) => ({ uri, format, content }));
}

const getDirectoryDocuments = async (directoryName, dbClient, recordSamplingSettings) => {
	const documents = await dbClient.documents.query(
		qb.where(
			qb.directory(directoryName)
		).slice(0, +recordSamplingSettings.absolute.value)
	).result();

	return documents.map(({ uri, format, content }) => ({ uri, format, content }));
}

const getEntityDataPackage = (entities, documentOrganizationType, containerProperties) => {
	setDependencies(dependencies);
	return entities.map(entity => {
		let parentDirectoryName = '';
		if (documentOrganizationType === DOCUMENTS_ORGANIZING_DIRECTORIES) {
			parentDirectoryName = findParentDirectoryName(entity.collectionName, entities);
		}

		const documentTemplate = entity.documents.reduce((template, doc) => _.merge(template, doc), {}); 

		return {
			...entity,
			bucketInfo: {
				...containerProperties
			},
			validation: {
				jsonSchema:	getEntityJSONSchema(documentTemplate, parentDirectoryName),
			}
		};
	});
}

const getEntityJSONSchema = (documentTemplate, parentDirectoryName) => {
	return schemaHelper.getSchema(documentTemplate, parentDirectoryName);
}

const findParentDirectoryName = (entityName, entities) => {
	if (entityName === '/') {
		return null;
	}
	
	const parentPath = entityName.split('/').slice(0, -2);
	let parentName = parentPath.join('/') + '/';
	
	if (parentPath.length === 1) {
		parentName = '/';
	}
	const parentDirectory = entities.find(entity => entity.collectionName === parentName);
	
	if (parentDirectory) {
		return parentName;
	}
	
	return findParentDirectoryName(parentName, entities);
}

const setDocumentsOrganizationType = (type) => {
	documentOrganizingType = type;
}

const getDBProperties = async (dbClient, dbName) => {
	setDependencies(dependencies);

	const propertiesConfig = getDBPropertiesConfig(dbName);

	const defaultResponseMapper = (response) => {
		return _.get(response, '[0].value');
	}

	const dbPropsData = await Promise.all(propertiesConfig.map(async item => {
		const response = await dbClient.xqueryEval(item.query).result();

		return {
			keyword: item.keyword,
			value: item.mapper ? item.mapper(response) : defaultResponseMapper(response),
		};
	}));

	return dbPropsData.reduce((acc, item) => {
		acc[item.keyword] = item.value;
		return acc;
	}, {});
}

module.exports = {
	DOCUMENTS_ORGANIZING_COLLECTIONS,
	DOCUMENTS_ORGANIZING_DIRECTORIES,
	getDBClient,
	releaseDBClient,
	getDBCollections,
	getDBDirectories,
	getDocumentOrganizingType,
	getCollectionDocuments,
	getDirectoryDocuments,
	getEntityDataPackage,
	setDocumentsOrganizationType,
	getDBProperties,
};