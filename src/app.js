require('dotenv').config()
const express = require('express')
const app = express()
const port = process.env.PORT || 3000
const { utcToZonedTime, format } = require('date-fns-tz')
const fromUnixTime = require('date-fns/fromUnixTime')
const { WebClient } = require('@slack/web-api')
const web = new WebClient(process.env.SLACK_OATH_TOKEN)
const { createEventAdapter } = require('@slack/events-api')
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET
const slackEvents = createEventAdapter(slackSigningSecret)
const bodyParser = require('body-parser')

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.post('/', (req, res) => {
  console.log(req.body)
  res.send(req.body.challenge)
})

app.use('/', slackEvents.requestListener())

// %%%%%%%%%%%%%%%%%%%%%%%
// DATABASE
const db = require('./db')
const Player = db.Player
const Rounds = db.Rounds
// **END** DATABASE
// %%%%%%%%%%%%%%%%%%%%%%%

// %%%%%%%%%%%%%%%%%%%%%%%
// GLOBAL VARIABLES
const chris = 'U0K10ECBX'
const chrisDisplay = 'Chris___'
const cortney = 'U0K1441TL'
const cortneyDisplay = 'Cortney'
const line = '————————————————'
const channel = 'D0K14GE6T' // Chris-Cortney DM
const penaltyVal = 120
let slackTime_hm
let slackTime_s
let winners = 0
let timeout = 0
let userState = [{
  user: chrisDisplay,
  pts: 0,
  totalPts: 0,
  penalty: false,
}, {
  user: cortneyDisplay,
  pts: 0,
  totalPts: 0,
  penalty: false,
}]
// **END** GLOBAL VARIABLES
// %%%%%%%%%%%%%%%%%%%%%%%

// %%%%%%%%%%%%%%%%%%%%%%%
// FUNCTIONS
const formatSlackTime = (timeFromSlack) => {
  let timeFull = fromUnixTime(timeFromSlack)
  let timeFullCST = utcToZonedTime(timeFull, 'America/Chicago')
  slackTime_hms = format(timeFullCST, 'h:mm:ss')
  slackTime_hm = format(timeFullCST, 'h:mm')
  slackTime_s = format(timeFullCST, 'ss')
}

const updatePlayerPoints = async (user, pts) => {
  try {
    const doc = await Player.findOne({ name: user })
    let totalPts = doc.points += pts
    await Player.findOneAndUpdate(
      { name: user },
      { points: totalPts },
      { new: true },
    )
  } catch(err) {
    console.log('error in updatePlayerPoints()', err)
  }
}

const updateAllPlayerPoints = async () => {
  try {
    await updatePlayerPoints(chrisDisplay, userState[0].pts)
    await updatePlayerPoints(cortneyDisplay, userState[1].pts)
  } catch(err) {
    console.log('error in updateAllPlayerPoints()', err)
  }
}

const updateUserPenalty = (user) => {
  userState.map(x => {
    if (x.user === user) {
      x.penalty = true
    }
  })
  console.log(`${user} committed a penalty`)
}

const updateUserPoints = (user) => {
  userState.map(x => {
    if (x.user === user && x.pts === 0) {
      if (x.penalty) {
        x.pts = 0 - penaltyVal
      } else {
        let diff = 60 - slackTime_s
        x.pts = diff
        winners++
        if (winners === 1) timeout = diff * 1000
        console.log(`timeout: ${timeout}, winners: ${winners}`)
      }
      console.log(user, `— pts: ${x.pts}`)
    }
  })
}

const updateUserTotalPoints = async (user, pts) => {
  try {
    const doc = await Player.findOne({ name: user })
    let totalPts = doc.points += pts
    userState.map(x => {
      if (x.user === user) {
        x.totalPts = totalPts
      }
    })
  } catch(err) {
    console.log('error in updateUserTotalPoints()', err)
  }
}

const updateAllUserTotalPoints = async () => {
  try {
    await updateUserTotalPoints(chrisDisplay, userState[0].pts)
    await updateUserTotalPoints(cortneyDisplay, userState[1].pts)
  } catch(err) {
    console.log('error in updateAllUserTotalPoints', err)
  }
}

const updateRoundsPlayed = async () => {
  try {
    const rounds = await Rounds.findById(db.RoundsID).exec()
    let roundsPlayed = rounds.played
    console.log('prev rounds played:', roundsPlayed)
    roundsPlayed++
    await Rounds.updateOne(
      { played: roundsPlayed }
    )
    console.log('curr rounds played:', roundsPlayed)
  } catch(err) {
    console.log('error in updateRoundsPlayed()', err)
  }
}

const by = (property) => {
  return (a, b) => {
    let result = 0
    if (a[property] < b[property]) {
      result = 1
    } else if (a[property] > b[property]) {
      result = -1
    }
    return result
  }
}

const postToSlack = async (text) => {
  try {
    web.chat.postMessage({ text, channel })
  } catch(err) {
    console.log('error in postToSlack()', err)
  }
}

const displayTitle = () => {
  return title = `
${line}
*10:23 GAME*  :clock1030:
`
}

const displayByPoints = () => {
  const sortByPts = [...userState].sort(by('pts'))

  return roundScores = `
*${sortByPts[0].user}* — \`${sortByPts[0].pts}\`
*${sortByPts[1].user}* — \`${sortByPts[1].pts}\``
}

const displayByTotalPoints = () => {
  const sortByTotalPts = [...userState].sort(by('totalPts'))

  console.log(sortByTotalPts)

  return totalScores = `
*${sortByTotalPts[0].user}* — \`${sortByTotalPts[0].totalPts}\`  :first_place_medal:
*${sortByTotalPts[1].user}* — \`${sortByTotalPts[1].totalPts}\`  :second_place_medal:
${line}`
}

const postToSlackAndUpdate = () => {
  console.log('postToSlackAndUpdate()')
  setTimeout(() => {
    (async() => {
      try {
        displayTitle()
        displayByPoints()
        displayByTotalPoints()

        const response = `
${title}
_ROUND SCORES_:
${roundScores}

_LEADERBOARD_:
${totalScores}`

        await postToSlack(response)
        await updateAllPlayerPoints()
        await updateRoundsPlayed()
        process.exit(1)

      } catch (err) {
        console.log('ERROR:', err)
      }
    })()
  }, timeout)
}
// **END** FUNCTIONS
// %%%%%%%%%%%%%%%%%%%%%%%

// %%%%%%%%%%%%%%%%%%%%%%%
// SLACK INTERACTION
slackEvents.on('message', async (e) => {
  try {
    formatSlackTime(e.ts)
    console.log('Slack EVENT —', slackTime_hms)

    if (e.channel === channel) {
      if (e.text === ':1023:' || e.text === ':1023: ') {
        if (slackTime_hm === '10:23') {

          if (e.user === chris) {
            updateUserPoints(chrisDisplay)
          } else if (e.user === cortney) {
            updateUserPoints(cortneyDisplay)
          }

          await updateAllUserTotalPoints()
          postToSlackAndUpdate()

        } else { // User posted outside 10:23

          const penaltyMsg = `posted outside of 10:23 at ${slackTime_hms} and will be deducted ${penaltyVal} points`
          const penaltyEmoji = ':no_entry_sign:'

          if (e.user === chris) {
            await postToSlack(`${penaltyEmoji} Chris ${penaltyMsg}`)
            updateUserPenalty(chrisDisplay)
            updateUserPoints(chrisDisplay)
          } else if (e.user === cortney) {
            await postToSlack(`${penaltyEmoji} Cortney ${penaltyMsg}`)
            updateUserPenalty(cortneyDisplay)
            updateUserPoints(cortneyDisplay)
          }

          await updateAllUserTotalPoints()
          postToSlackAndUpdate()
        }
      }
      if (e.text === '1023') { // If user posts '1023', it will display stats

        const chris = await Player.findOne({ name: chrisDisplay })
        userState[0].totalPts = chris.points
        const cortney = await Player.findOne({ name: cortneyDisplay })
        userState[1].totalPts = cortney.points

        displayTitle()
        displayByTotalPoints()

        const response =`
${title}
_LEADERBOARD_:
${totalScores}`

        await postToSlack(response)
      }
    }
  } catch(err) {
    console.log('error in Slack event', err)
  }
})
// **END** SLACK INTERACTION
// %%%%%%%%%%%%%%%%%%%%%%%

app.get('/', (req, res) => {
  res.send('slack_1023_cort')
})

app.listen(port, () => {
  console.log(`Express app is up on port: ${port}`)
})
