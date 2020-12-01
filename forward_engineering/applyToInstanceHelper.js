const marklogic = require('../reverse_engineering/node_modules/marklogic');

const getDBClient = (connectionInfo, database = null) => {
	return marklogic.createDatabaseClient({
			host: connectionInfo.host,
			port: connectionInfo.port,
			user: connectionInfo.username,
			password: connectionInfo.password,
			...(database && { database }),
		});
}

const testConnection = dbClient => {
	return dbClient.checkConnection().result();
}

const applyScript = (dbClient, script) => {
	return dbClient.eval(script).result();
}

module.exports = {
	getDBClient,
	testConnection,
	applyScript,
};