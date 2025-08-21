const {z} = require("zod");
const { makeParseableResponseFormat, makeParseableTextFormat } = require('openai/lib/parser');

function zodResponseFormat(
  zodObject,
  name,
  props,
) {
  return makeParseableResponseFormat(
    {
      type: 'json_schema',
      json_schema: {
        ...props,
        name,
        strict: true,
        schema: z.toJSONSchema(zodObject, { target: 'draft-7' }),
      },
    },
    (content) => zodObject.parse(JSON.parse(content)),
  );
}

function zodTextFormat(zodObject, name, props) {
  return makeParseableTextFormat(
    {
      type: 'json_schema',
      ...props,
      name,
      strict: true,
      schema: z.toJSONSchema(zodObject, { target: 'draft-7' }),
    },
    (content) => zodObject.parse(JSON.parse(content)),
  );
}


module.exports = {
  zodTextFormat, zodResponseFormat, z
}