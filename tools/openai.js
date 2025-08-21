require('dotenv').config()

const openai = require('openai')

console.log(process.env.OPENAI_API_KEY)
const client = new openai(process.env.OPENAI_API_KEY)


module.exports = client