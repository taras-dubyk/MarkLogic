const { setDependencies, dependencies } = require('./appDependencies');
const { getDBClient, testConnection, applyScript } = require('./applyToInstanceHelper');

const setLocalDependencies = ({ lodash }) => _ = lodash;
let _;

module.exports = {
	generateContainerScript(data, logger, cb, app) {
		setDependencies(app);
		setLocalDependencies(dependencies);

		let { collections, containerData } = data;
		logger.clear();
		try {
			const script = collections.map(
				collectionSchema => getValidationSchemaData(JSON.parse(collectionSchema))
			).reduce((script, schemaData) => {
				return script + '\n\n' + getSchemaInsertStatement(schemaData);
			}, getStartStatements());

			cb(null, script);
		} catch(e) {
			logger.log('error', { message: e.message, stack: e.stack }, 'Forward-Engineering Error');
			setTimeout(() => {
				cb({ message: e.message, stack: e.stack });
			}, 150);
			return;
		}
	},

	async applyToInstance(data, logger, cb, app) {
		try {
			setDependencies(app);
			setLocalDependencies(dependencies);
			logger.clear();
			logger.log('info', data, data.hiddenKeys);

			if (!data.script) {
				return cb({ message: 'Empty script' });
			}

			if (!data.containerData) {
				return cb({ message: 'Empty container data' });
			}
			const containerProps = _.get(data.containerData, '[0]', {});
			if (!containerProps.schemaDB) {
				return cb({ message: 'Schema database wasn\'t specified' });
			}

			const client = getDBClient(data, containerProps.schemaDB);
			await applyScript(client, data.script);
			cb();
		} catch(err) {
			cb(mapError(err));
		}
	},

	async testConnection(connectionInfo, logger, cb, app) {
		logger.clear();
		logger.log('info', connectionInfo, 'Test connection', connectionInfo.hiddenKeys);
		try {
			const client = getDBClient(connectionInfo);
			await testConnection(client);
			return cb();
		} catch(err) {
			logger.log('error', mapError(err), 'Connection failed');
			return cb(mapError(err));
		}
	}
};

const getValidationSchemaData = jsonSchema => {
	return {
		schema: {
			...(_.pick(jsonSchema, ['$schema', 'id', 'type', 'title', 'description', 'additionalProperties'])),
			...getAdoptedSchema(jsonSchema),
		},
		uri: getSchemaURI(jsonSchema),
	};
}

const getAdoptedSchema = schema => {
	const availableKeys = ['enum', 'additionalItems', 'maxItems', 'minItems', 'uniqueItems',
		'multipleOf', 'maximum', 'exclusiveMaximum', 'minimum',
		'exclusiveMinimum', 'maxProperties', 'minProperties', 'required',
		'additionalProperties', 'properties', 'patternProperties',
		'dependencies', 'maxLength', 'minLength', 'pattern', 'format', 'description'
	]; 
	const adoptedSchema = {
		type: getType(schema.type),
		...(_.pick(schema, availableKeys)),
		...(getChoices(schema)),
	};

	if (schema.properties) {
		adoptedSchema.properties = getProperties(schema.properties);
	}

	if (schema.patternProperties) {
		adoptedSchema.patternProperties = getProperties(schema.properties);
	}

	if (schema.items) {
		adoptedSchema.items = getArrayItems(schema.items);
	}

	return adoptedSchema;
}

const getType = type => {
	switch (type) {
		case 'geoSpatial':
			return 'object';
		case 'binary':
			return 'string';
		default:
			return type;
	}
}

const getProperties = properties => {
	const adoptedProperties = {};
	for (const key in properties) {
		adoptedProperties[key] = getAdoptedSchema(properties[key]);
	}
	return adoptedProperties;
}

const getArrayItems = arrayItems => {
	return arrayItems.map(getAdoptedSchema);
}

const getSchemaURI = schema => {
	if (schema.schemaURI) {
		let schemaUri = schema.schemaURI;
		if (!schemaUri.startsWith('/')) {
			schemaUri = '/' + schemaUri;
		}
		if (!schemaUri.toLowerCase().endsWith('.json')) {
			schemaUri = schemaUri + '.json';
		}
		return schemaUri;
	} else {
		const collectionName = schema.code || schema.collectionName;
		return `/${collectionName}.json`;
	}
}

const getStartStatements = () => {
	return `'use strict';\n\ndeclareUpdate();`;
}

const getSchemaInsertStatement = ({ uri, schema }) => {
	return `xdmp.documentInsert("${uri}", ${JSON.stringify(schema, null, 2)});`;
}

const getChoices = schema => {
	const choices = {};
	if (Array.isArray(schema.allOf)) {
		choices.allOf = schema.allOf.map(getAdoptedSchema);
	}
	if (Array.isArray(schema.anyOf)) {
		choices.anyOf = schema.anyOf.map(getAdoptedSchema);
	}
	if (Array.isArray(schema.oneOf)) {
		choices.oneOf = schema.oneOf.map(getAdoptedSchema);
	}
	if (schema.not) {
		choices.not = getAdoptedSchema(schema.not);
	}
	
	return choices;
}

const mapError = (error) => {
	if (!(error instanceof Error)) {
		return error;
	}

	return {
		message: error.message,
		stack: error.stack
	};
};
