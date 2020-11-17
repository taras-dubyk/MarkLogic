'use strict';
const marklogic = require('marklogic');
const {
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
	getDBProperties
} = require('./dbHelper');
const { prepareError } = require('./generalHelper');
const logHelper = require('./logHelper');
const { setDependencies } = require('./appDependencies');

module.exports = {
	connect: function (connectionInfo, logger, cb) {
		const dbClient = getDBClient(connectionInfo);
		cb(dbClient);
	},

	disconnect: function (connectionInfo, cb) {
		releaseDBClient();
		cb();
	},

	testConnection: function (connectionInfo, logger, cb, app) {
		logInfo('Test connection', connectionInfo, logger);
		this.connect(connectionInfo, logger, async (dbClient) => {
			try {
				await dbClient.checkConnection().result();
				logger.log('info', 'Connection successful', 'Test connection');
				cb();
			} catch (err) {
				logger.log('info', 'Connection failed', 'Test connection');
				cb(prepareError(err));
			}
			this.disconnect(connectionInfo, () => {});
		});
	},

	getDbCollectionsNames: function(connectionInfo, logger, cb, app) {
		logInfo('Retrieving collections/directories information', connectionInfo, logger);

		this.connect(connectionInfo, logger, async (dbClient) => {
			try {
				let dbCollections = [];
				switch (connectionInfo.documentsOrganizing) {
					case 'collections':
						dbCollections = await getDBCollections(dbClient);
						setDocumentsOrganizationType(DOCUMENTS_ORGANIZING_COLLECTIONS);
						break;
					case 'directories':
						dbCollections = await getDBDirectories(dbClient);
						setDocumentsOrganizationType(DOCUMENTS_ORGANIZING_DIRECTORIES);
						break;
					default:
						dbCollections = await getDBCollections(dbClient);
						if (dbCollections.length === 0) {
							dbCollections = await getDBDirectories(dbClient);
						}
				}

				const result = [{
					dbCollections,
					dbName: 'Documents',
				}];

				cb(null, result);
			} catch (err) {
				logger.log('error', err, 'Retrieving collections/directories information');
				cb(prepareError(err));
			}
		});
	},

	getDbCollectionsData: async function(data, logger, cb, app) {
		logger.log('info', data, 'Retrieving documents', data.hiddenKeys);
		setDependencies(app);
		
		const dbName = data.collectionData.dataBaseNames[0];
		const entityNames = data.collectionData.collections[dbName] || [];
		const includeEmptyCollection = data.includeEmptyCollection;
		const recordSamplingSettings = data.recordSamplingSettings;
		const containerLevelKeys = {
			uri: 'uri',
			_format: 'format',
			contentType: 'contentType',
			content: 'content'
		};

		try {
			const dbClient = getDBClient();
			const documentOrganizationType = await getDocumentOrganizingType(dbClient);
			const containerProperties = await getDBProperties(dbClient, dbName);
			
			const entityDataPromise = entityNames.map(async entityName => {
				let documents;
				if (documentOrganizationType === DOCUMENTS_ORGANIZING_COLLECTIONS) {
					documents = await getCollectionDocuments(entityName, dbClient, recordSamplingSettings);
				} else {
					documents = await getDirectoryDocuments(entityName, dbClient, recordSamplingSettings);
				}
				logger.progress({ message: 'Documents have loaded', containerName: dbName, entityName });
				
				return {
					dbName,
					collectionName: entityName,
					documents,
					entityLevel: {
						storeAsCollDir: DOCUMENTS_ORGANIZING_COLLECTIONS ? 'collection' : 'directory'
					},
					containerLevelKeys,
				};
			});

			const entities = await Promise.all(entityDataPromise);
			const entityDataPackage = getEntityDataPackage(entities, documentOrganizationType, containerProperties);

			logger.progress({ message: 'Reverse-Engineering complete!', containerName: '', entityName: '' });
			
			cb(null, entityDataPackage);
		} catch (err) {
			logger.log('error', err, 'Retrieving collections/directories information');
				cb(prepareError(err));
		}
	}
};

const logInfo = (step, connectionInfo, logger) => {
	logger.clear();
	logger.log('info', logHelper.getSystemInfo(connectionInfo.appVersion), step);
	logger.log('info', connectionInfo, 'connectionInfo', connectionInfo.hiddenKeys);
};
