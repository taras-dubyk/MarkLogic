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
			///
			// const pets = [
			// 	{ name: 'fish1', kind: 'fish' },
			// 	{ name: 'fish2', kind: 'fish' },
			// 	{ name: 'fish3', kind: 'fish' },
			// 	{ name: 'fish4', kind: 'fish' }
			//   ];
			// const points = [{
			// 	"myPoint": {
			// 		"type": "point",
			// 		"coordinates": [
			// 			-65,
			// 			4
			// 		]
			// 	},
			// 	"myPoint": {
			// 		"type": "point",
			// 		"coordinates": [
			// 			1,
			// 			2
			// 		]
			// 	}
			// }];
			//   const collName = 'points';
			//   await dbClient.createCollection(collName, points).result();
					// const documents = [
		const documents = [
			{
				uri: '/gs/kiness/mark.json',
				content: {
					name: 'Lviv',
					address: 'lviv',
					desc:
						'The aardvark is a medium-sized burrowing, nocturnal mammal.',
				},
			},
			{
				uri: '/gs/kiness/twen.json',
				content: {
					name: 'Kyiv',
					address: 'kyiv',
					desc:
						'The bluebird is a medium-sized, mostly insectivorous bird.',
				},
			}
		];
		////
		
			try {
				await dbClient.documents.write(documents).result();
				await dbClient.checkConnection().result();
				logger.log('info', 'Connection successful', 'Test connection');
				cb();
			} catch (err) {
				logger.log('info', 'Connection failed', 'Test connection');
				cb(prepareError(err));
			}
			this.disconnect(connectionInfo, () => {});
		});

		// const documents = [
		// 	{
		// 		uri: '/gs/address/mark.json',
		// 		content: {
		// 			name: 'Lviv',
		// 			address: 'lviv',
		// 			desc:
		// 				'The aardvark is a medium-sized burrowing, nocturnal mammal.',
		// 		},
		// 	},
		// 	{
		// 		uri: '/gs/address/twen.json',
		// 		content: {
		// 			name: 'Kyiv',
		// 			address: 'kyiv',
		// 			desc:
		// 				'The bluebird is a medium-sized, mostly insectivorous bird.',
		// 		},
		// 	}
		// ];

		// db.documents.write(documents).result(
		// 	(response) => {
		// 		console.log('Loaded the following documents:');
		// 		response.documents.forEach(function (document) {
		// 			console.log('  ' + document.uri);
		// 		});
		// 		cb();
		// 	},
		// 	(error) => {
		// 		console.log(JSON.stringify(error, null, 2));
		// 		cb(true);
		// 	}
		// );
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
		const entityNames = data.collectionData.collections[dbName];
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
			const entityDataPackage = getEntityDataPackage(entities, documentOrganizationType);

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
