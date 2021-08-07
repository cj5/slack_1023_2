require('dotenv').config()
const express = require('express')
const app = express()
const port = process.env.PORT || 3000

app.get('/', (req, res) => {
  res.send('slack_1023_cort')
})

app.post('/challenge', (req, res) => {
  console.log(req.body)
  res.send(req.body.challenge)
})

app.listen(port, () => {
  console.log(`Express app is up on port: ${port}`)
})
