const https = require("https");
const discord = require('discord.js');
const embedMessage = discord.MessageEmbed;
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
var inactiveTime = 604800000;
const client = new discord.Client();
const apiKey = process.env.apiKey;
const discordToken = process.env.discordToken;
const commandPrefix = process.env.commandPrefix;
var memberExpirationTime = process.env.memberExpirationTime;
const {Pool} = require('pg')
var string = process.env.DATABASE_URL;
var string = string.substring("postgres://".length)
var username = string.substring(string.search(":"),-1)
var string = string.substring(string.search(":")+1)
var password = string.substring(string.search('@'), -1);
var string = string.substring(string.search("@")+1);
var host = string.substring(string.search(":"), -1);
var string = string.substring(string.search(":")+1);
var port = string.substring(string.search("/"), -1);
var string = string.substring(string.search("/")+1);
var database = string;
var lastUpdate = new Date().getTime();
loginDetails = {
  user: username,
  host: host,
  database: database,
  password: password,
  port: port,
  ssl: {
    rejectUnauthorized: false
  }
}
const dbs = new Pool(loginDetails)
db = {
  profiles: [],
  users: [],
  guilds: []
}
const jsf = require("jsonfile")
const fs = require("fs")
dbfile = __dirname + "/Thumbnails.json"
thumbnails = {}
try {
    fs.lstatSync(dbfile);
    thumbnails = jsf.readFileSync(dbfile);
}
catch (e) {
    // File missing or invalid json
    console.log("WARNING - Database file missing or corrupt - creating empty DB");
    thumbnails = {};
}
var newMembers = {}
async function test() {
  db.profiles = (await dbs.query('select * from public."Profiles"')).rows;
  db.users = (await dbs.query('select * from public."Users"')).rows;
  db.guilds = (await dbs.query('select * from public."Guilds"')).rows;
}
test();
function getName(uuid) {
  return new Promise((resolve, reject) => {
    var nameOptions = {
      host: 'sessionserver.mojang.com',
      path: '/session/minecraft/profile/' + uuid
    }
    https.get(nameOptions, (response) => {
      var str = '';

      //another chunk of data has been received, so append it to `str`
      response.on('data', function (chunk) {
        str += chunk;
      });

      response.on('error', function (error) {
        reject(error);
      })
      //the whole response has been received, so we just print it out here
      response.on('end', function () {
        //var info = JSON.parse(str);
        resolve(JSON.parse(str).name);
      });
    })
  })
}
function addMember(profile, uuid) {
  return new Promise(async (resolve, reject) => {
    if (uuid == "Bank Interest") {
      const member = {
        name: uuid,
        uuid: uuid,
        contribution: 0
      }
      profile.members.push(member);
    } else {
      const member = {
        name: await getName(uuid),
        uuid: uuid,
        contribution: 0
      }
      profile.members.push(member);
    }
    resolve(profile)
  });
}
async function updateData(profile) {
  return new Promise(async (resolve, reject) => {
    for (i in profile.members) {
      if (profile.members[i].name != 'Bank Interest') {
        profile.members[i].name = await getName(profile.members[i].uuid);
      }
    }
    resolve(profile)
  });
}
function newProfile(id) {
  var profile = {
    id: id,
    members: [],
    lastUpdate: 0,
    total: 0
  }
  addMember(profile,"Bank Interest");
  return profile;
}

function parseName(name) {
  if (name[0] == '§') {
    return name.substring(2);
  } else {
    return name;
  }
}


function getProfile(id) {
  return new Promise((resolve, reject) => {
    var options = {
      host: 'api.hypixel.net',
      path: '/skyblock/profile?key=' + apiKey + '&profile=' + id
    }
    https.get(options, (response) => {
      var str = '';

      //another chunk of data has been received, so append it to `str`
      response.on('data', function (chunk) {
        str += chunk;
      });

      response.on('error', function (error) {
        reject(error);
      })
      //the whole response has been received, so we just print it out here
      response.on('end', function () {
        //var info = JSON.parse(str);
        resolve(JSON.parse(str));
      });
    })
  })
}

function getPlayer(members, player) {
  for (i in members) {
    if (members[i].name == player) {
      return i;
    }
  }
}
function checkMembers(profile, profileData) {
  return new Promise(async (resolve, reject) => {
    var newMembers = [];
    for (i in profileData.members) {
      var foundUUID = false;
      for (j in profile.members) {
        if (i == profile.members[j].uuid) {
          foundUUID = true;
          profile.members[j].last_save = profileData.members[i].last_save
          break;
        }
      }
      if (!foundUUID) {
        newMembers.push(i)
      }
    }
    for (i in newMembers) {
      profile = await addMember(profile, newMembers[i]);
    }
    resolve(profile)
    return profile;
  })
}
function updateTransactions(profile, profileData) {
  return new Promise(async (resolve, reject) => {
    var newestTimeStamp = profile.lastUpdate;
    if (!profileData.banking) {
      resolve(false);
      return false;
    }
    if (!profileData.banking.transactions) {
      resolve(false);
      return false;
    }
    for (i in profileData.banking.transactions) {
      var action = profileData.banking.transactions[i];
      var amount = 0;
      if (action.timestamp > profile.lastUpdate) {
        if (action.timestamp > newestTimeStamp) {
          newestTimeStamp = action.timestamp;
        }
        if (action.action == "WITHDRAW") {
          amount -= parseInt(action.amount);
        } else if (action.action == "DEPOSIT") {
          amount += parseInt(action.amount);
        }
        var playerIndex = getPlayer(profile.members, parseName(action.initiator_name))
        if (playerIndex != null) {

          profile.members[playerIndex].contribution += amount;
        } else {
          profile = await updateData(profile);
          var playerIndex = getPlayer(profile.members, parseName(action.initiator_name))
          if (playerIndex != null) {
            profile.members[playerIndex].contribution += amount;
          }
        }
      }
    }
    profile.lastUpdate = newestTimeStamp;
    profile.total = profileData.banking.balance;
    resolve(profile)
    return profile;
  })
}
function checkProfile(i) {
  return new Promise(async (resolve, reject) => {``
    var profile = db.profiles[i];
    var res = await getProfile(profile.id);
    if (!res || !res.success) {
      resolve(true)
      return true;
    } else if (res.profile == null) {
      resolve(false);
      return false;
    }
    var profileData = res.profile;
    profile = await checkMembers(profile,profileData)
    var result = await updateTransactions(profile,profileData);
    if (!result) {
      resolve(false);
      return false;
    }
    profile = result;
    db.profiles[iter] = profile;
    await dbs.query('insert into public."Profiles" (id, members, "lastUpdate", total) values ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET members=$2, "lastUpdate"=$3, total=$4',
    [profile.id,profile.members,profile.lastUpdate, profile.total])
    console.log(profile);
    resolve(true);
    return true;
  })
}
function updateLoop() {
  return new Promise(async (resolve, reject) => {
    let time = new Date().getTime()
    for (i in newMembers) {
      if (newMembers[i].time+(memberExpirationTime*1000) <= time) {
        if (newMembers[i].channelID == "DM") {
          client.users.fetch(i).then(channel => channel.send(errorMsg(`<@${i}> Linking expired!`))).catch(console.error)
        } else {
          client.channels.fetch(newMembers[i].channelID).then(channel => channel.send(errorMsg(`<@${i}> Linking expired!`))).catch(console.error)
        }
        delete newMembers[i];
      }
    }
    var profilesToDelete = []
    for (iter in db.profiles) {
      if (!(await checkProfile(iter))) {
        profilesToDelete.push(iter)
      }
    }
    for (iter in profilesToDelete) {
      await dbs.query('delete from public."Profiles" where id=$1', [db.profiles[profilesToDelete[iter]].id])
      db.profiles.splice(profilesToDelete[iter],1);
    }
    lastUpdate = new Date().getTime()
    resolve()
  })
}
setInterval(updateLoop, 30000);
function getProfiles(uuid) {
  return new Promise((resolve, reject) => {
    var options = {
      host: 'api.hypixel.net',
      path: '/skyblock/profiles?key=' + apiKey + '&uuid=' + uuid
    }
    https.get(options, (response) => {
      var str = '';

      //another chunk of data has been received, so append it to `str`
      response.on('data', function (chunk) {
        str += chunk;
      });

      response.on('error', function (error) {
        reject(error);
      })
      //the whole response has been received, so we just print it out here
      response.on('end', function () {
        //var info = JSON.parse(str);
        resolve(JSON.parse(str));
      });
    })
  })
}
function getUUID(name) {
  return new Promise((resolve, reject) => {
    var options = {
      host: 'api.mojang.com',
      path: '/profiles/minecraft',
      method: 'POST'
    }
    const req = https.request(options, (response) => {
      var str = '';

      //another chunk of data has been received, so append it to `str`
      response.on('data', function (chunk) {
        str += chunk;
      });

      response.on('error', function (error) {
        reject(error);
      })
      //the whole response has been received, so we just print it out here
      response.on('end', function () {
        //var info = JSON.parse(str);
        resolve(JSON.parse(str));
      });
    })
    req.write(JSON.stringify([name]));
    req.end();
  })
}
function getUser(id) {
  for (i in db.users) {
    if (db.users[i].discordid == id) {
      return db.users[i]
    }
  }
  return null
}
function getGuildPrefix(id) {
  for (i in db.guilds) {
    if (db.guilds[i].id == id) {
      return db.guilds[i].prefix;
    }
  }
  console.log('default')
  console.log(db.guilds[i])
  return commandPrefix
}
function errorMsg(msg) {
  return embed = new embedMessage()
    .setColor(0xFF0000)
    .setDescription(msg);
}
function successMsg(msg) {
  return embed = new embedMessage()
    .setColor(0x00FF00)
    .setDescription(msg);
}
function round(number, place) {
  return Math.round(number*place)/place
}
function parseNumbers(number) {
  parts = number.toString().split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return parts.join(".")
}
console.log(parseNumbers(12345678912))
client.on('ready', () => {
  console.log('Ready to go!');
  client.user.setPresence({ activity: { name: '@ me for help!', type: "LISTENING"}, status: 'online' })
});
client.on('message', async msg => {
  try {
  if (msg.author.bot) return;
  var message = msg.content.toLowerCase();
  let pCommandPrefix = commandPrefix;
  if (msg.channel.type == "dm") {
    pCommandPrefix = "";
  } else {
    pCommandPrefix = getGuildPrefix(msg.channel.guild.id)
  }
  var mentions = Array.from(msg.mentions.users.keys())
  for (i in mentions) {
    if (mentions[i] == client.user.id) {
      message = pCommandPrefix + "help"
      break;
    }
  }
  if(!message.startsWith(pCommandPrefix)) return;
  var args = message.substring(pCommandPrefix.length).split(' ');
  if (args[0] == "link") {
    let res = await getUUID(args[1]);
    if (res.length == 0 || res[0].id == null) {
      msg.channel.send(errorMsg('Invalid name!'));
      return;
    }
    var random = Math.floor(9999*Math.random())
    var channelID = "DM"
    if (msg.channel.type != "dm") {
      channelID = msg.channel.id
    }
    newMembers[msg.author.id] ={
      amount: random,
      time: new Date().getTime(),
      uuid: res[0].id,
      username: args[1],
      channelID: channelID
    }
    if (db.users.filter(user => user.discordid == msg.author.id).length <= 0) {
      let member = {
        discordid: msg.author.id,
        linkedUsers: {},
        followedUsers: {},
        main: false,
        lastAPICall: 0
      }
      await dbs.query('insert into public."Users" (discordid, "linkedUsers", "followedUsers", main) values ($1, $2, $3, $4)'+
      'ON CONFLICT (discordid) DO UPDATE SET "linkedUsers"=$2,"followedUsers"=$3,main=$4',
      [member.discordid, member.linkedUsers, member.followedUsers, member.main])
      db.users.push(member)
    }
    msg.channel.send(successMsg(`Deposit or withdraw ${random} on any profile and then do /confirm. Make sure that your banking api is on and that this is your account.`).setFooter(`Will expire in ${memberExpirationTime/60} minutes!`))
  } else if (args[0] == "confirm") {
    if (!newMembers[msg.author.id]) {
      msg.channel.send(errorMsg('You have not done the first step! Do /link <mc username> and follow the instructions from there.'))
      return;
    }
    if (newMembers[msg.author.id].time+(memberExpirationTime*1000) <= new Date().getTime()) {
      delete newMembers[msg.author.id]
      msg.channel.send(errorMsg("Linking expired!"))
      return;
    }
    res = await getProfiles(newMembers[msg.author.id].uuid);
    if (!res.success) {
      msg.channel.send(errorMsg('Not a hypixel user!'))
      return;
    }
    userID = 0;
    for (i in db.users) {
      if (db.users[i].discordid == msg.author.id) {
        userID = i
      }
    }
    if (db.users[userID].lastAPICall && db.users[userID].lastAPICall+(20*1000) <= new Date().getTime()) {
      msg.channel.send(errorMsg("Too many API calls! Please wait a bit before your next request!"))
    }
    const user = {
      profiles: [],
      username: newMembers[msg.author.id].username.toLowerCase()
    }
    let text = ""
    var authenticated = false;
    for (i in res.profiles) {
      const profile = {
        id: res.profiles[i].profile_id,
        name: res.profiles[i].cute_name.toLowerCase()
      };
      user.profiles.push(profile);
      if (text == "") {
        text = res.profiles[i].cute_name
      } else {
        text += ", " + res.profiles[i].cute_name
      }
      if (res.profiles[i].banking && res.profiles[i].banking.transactions) {
        for (g in res.profiles[i].banking.transactions) {
          var action = res.profiles[i].banking.transactions[g];
          if (action.timestamp >  newMembers[msg.author.id].time) {
            console.log(parseName(action.initiator_name).toLowerCase() == parseName(newMembers[msg.author.id].username).toLowerCase())
            if (action.amount == newMembers[msg.author.id].amount && parseName(action.initiator_name).toLowerCase() == parseName(newMembers[msg.author.id].username).toLowerCase()) {
              authenticated = true;
            }
          }
        }
      }
    }
    db.users[userID].lastAPICall = new Date().getTime()
    if (!authenticated) {
      msg.channel.send(errorMsg('No transaction detected! Make sure your banking api is on if you did the transaction!'))
      return;
    }
    db.users[userID].linkedUsers[newMembers[msg.author.id].uuid] = user
    delete newMembers[msg.author.id]
    let tmpUser = ""
    tmpUser = db.users[userID]
    if (tmpUser == "") {
      console.error("No user profile found!")
      return
    }
    await dbs.query('insert into public."Users" (discordid, "linkedUsers", "followedUsers", main) values ($1, $2, $3, $4)'+
    'ON CONFLICT (discordid) DO UPDATE SET "linkedUsers"=$2,"followedUsers"=$3,main=$4',
    [tmpUser.discordid, tmpUser.linkedUsers, tmpUser.followedUsers, tmpUser.main])
    msg.channel.send(successMsg("Success! Available profiles: " + text))
  }else if(args[0] == "get") {
    user = getUser(msg.author.id);
    if (!user || !user.discordid) {
      msg.channel.send(errorMsg('You haven\'t linked your account!'))
      return;
    }
    profile = ''
    account = ''
    if (args[2]) {
      loc = false
      for (i in user.linkedUsers) {
        if (user.linkedUsers[i].username == args[2]) {
          loc = i
          break;
        }
      }
      if (!loc) {
        msg.channel.send(errorMsg('Invalid username!'))
        return;
      }
      account = loc
    } else {
      account = user.main;
    }
    for (i in user.linkedUsers[account].profiles) {
      if (args.length >= 2 && user.linkedUsers[user.main].profiles[i].name == args[1].toLowerCase()) {
          profile = user.linkedUsers[user.main].profiles[i].id
        break
      }
    } 
    if (profile == '') {
      let text = ''
      for (i in user.profiles) {
        if (text == '') {
          text = user.profiles[i].name
        } else {
          text += ", " + user.profiles[i].name
        }
      }
      msg.channel.send(errorMsg('Invalid profile! Your profiles: ' + text))
      return;
    }
    let data = '';
    for (i in db.profiles) {
      if (db.profiles[i].id == profile) {
        data = db.profiles[i]
        break
      }
    }
    if (data != '') {
      let text = ''
      let time = new Date().getTime()
      let totalCalculated = 0;
      for (i in data.members) {
        if (!data.members[i].last_save || time-data.members[i].last_save <= inactiveTime || (args[2] && args[2] == "all")){
          if (data.members[i].contribution < 0) {
            text += "-";
          } else if (data.members[i].contribution > 0) {
            text += "+"
          }
          totalCalculated += data.members[i].contribution
          text += data.members[i].name + ": " + parseNumbers(data.members[i].contribution) + '\n';
        }
      }
      msg.channel.send(successMsg("```DIFF\n" + text + `total: ${parseNumbers(round(data.total,100))}\ndiscrepancy: ${parseNumbers(round(data.total-totalCalculated,100))}` + "```").setTitle(args[1][0].toUpperCase() + args[1].slice(1) + "'s Banking Stats")
        .setFooter(`Updated ${Math.round((new Date().getTime()-lastUpdate)/1000)} seconds ago.`)
        .setThumbnail(thumbnails[args[1]][Math.floor(thumbnails[args[1]].length*Math.random())]))
    } else {
      msg.channel.send(errorMsg('This account is not being tracked!'))
    }
  } else if (args[0] == "set") {
    if (args[1] == "main") {
      found = false
      for (i in db.users) {
        if (db.users[i].discordid == msg.author.id) {
          for (j in db.users[i].linkedUsers) {
            if (db.users[i].linkedUsers[j].username == args[2].toLowerCase()) {
              db.users[i].main = j
              tmpUser = db.users[i]
              await dbs.query('insert into public."Users" (discordid, "linkedUsers", "followedUsers", main) values ($1, $2, $3, $4)'+
              'ON CONFLICT (discordid) DO UPDATE SET "linkedUsers"=$2,"followedUsers"=$3,main=$4',
              [tmpUser.discordid, tmpUser.linkedUsers, tmpUser.followedUsers, tmpUser.main])
              found = true
              break
            }
          }
          break
        }
      }
      if (found) {
        msg.channel.send(successMsg("Main account set to " + args[2] + "!"))
      } else {
        msg.channel.send(errorMsg("Account not found!"))
      }
    }
  }else if (args[0] == "track") {
    user = getUser(msg.author.id);
    if (!user || !user.discordid) {
      msg.channel.send(errorMsg('You haven\'t linked your account!'))
      return;
    }
    if (!user.main && !args[2]) {
      msg.channel.send(errorMsg('You didn\'t have a main account and you didn\t specify an account!'))
      return;
    }
    profile = ''
    let profilenum = 0
    account = ''
    if (args[2]) {
      loc = false
      for (i in user.linkedUsers) {
        if (user.linkedUsers[i].username == args[2]) {
          loc = i
          break;
        }
      }
      if (!loc) {
        msg.channel.send(errorMsg('Invalid username!'))
        return;
      }
      account = loc
    } else {
      account = user.main;
    }
    for (i in user.linkedUsers[account].profiles) {
      if (args.length >= 2 && user.linkedUsers[user.main].profiles[i].name == args[1].toLowerCase()) {
          profile = user.linkedUsers[user.main].profiles[i].id
        break
      }
    } 
    if (profile != '') {
      let data = '';
      for (i in db.profiles) {
        if (db.profiles[i].id == profile) {
          data = db.profiles[i]
          break
        }
      }
      if (data == '') {
        let tempProfile = newProfile(profile);
        db.profiles.push(tempProfile);
        await dbs.query('insert into public."Profiles" (id, members, "lastUpdate", total) values ($1, $2, $3,$4) ON CONFLICT (id) DO UPDATE SET members=$2, "lastUpdate"=$3, total=$4',
        [tempProfile.id,tempProfile.members, tempProfile.lastUpdate, tempProfile.total])
        msg.channel.send(successMsg('Now tracking ' + args[1]))
      } else {
        msg.channel.send(errorMsg('This account is already being tracked!'))
      }
    } else {
      let text = ''
      for (i in user.profiles) {
        if (text == '') {
          text = user.profiles[i].name
        } else {
          text += ", " + user.profiles[i].name
        }
      }
      msg.channel.send(errorMsg('Invalid profile! Your profiles: ' + text))
      return;
    }
  } else if (args[0] == "profiles") {
    user = getUser(msg.author.id);
    if (!user || !user.discordid) {
      msg.channel.send(errorMsg('You haven\'t linked your account!'))
      return;
    }
    let text = '';
    for (i in user.profiles) {
      if (text == '') {
        text = user.profiles[i].name
      } else {
        text += ", " + user.profiles[i].name
      }
    }
    msg.channel.send(successMsg("Your profiles: " + text));
  } else if (args[0] == "setprefix") {
    if (msg.channel.type == "dm") {
      msg.channel.send(errorMsg("You can't do that in a DM!"));
      return;
    }
    if (!msg.member.permissions.has("ADMINISTRATOR")) {
      msg.channel.send(errorMsg("You don't have permission to do this!"));
      return
    }
    if (args.length <= 1) {
      msg.channel.send(errorMsg("Please provide a prefix!"));
      return;
    }
    var guild = {
      id: msg.channel.guild.id,
      prefix: args[1]
    };
    var exists = false;
    for (iter in db.guilds) {
      if (db.guilds[iter].id == guild.id) {
        db.guilds[iter] = guild;
        exists = true;
        break;
      }
    }
    if (!exists) {
      db.guilds.push(guild);
    }
    dbs.query('insert into public."Guilds" (id,prefix) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET prefix=$2', [guild.id, guild.prefix])
    msg.channel.send(`Command prefix set to ${args[1]}`);w
  }else if(args[0] == "help") {
    var commands = [
      'help -- lists commands',
      'link <username> -- will link your hypixel account to the bot',
      "track <profile> [username]-- lists profiles linked to your account",
      "get <profile> [username]-- will return the latest bank stats username is required if you haven't set main account",
      "setprefix <prefix> -- sets the bot's command prefix for the server",
      "set main <username> -- will set main account so you don't have to type your username everytime."
    ]
    var text = '```\n';
    for (command in commands) {
      text += pCommandPrefix + commands[command] + "\n";
    }
    text += "```"
    const embed = new embedMessage()
      .setTitle('Help menu')
      .setColor(0x00FFFF)
      .setDescription(text);
    msg.channel.send(embed)
    return;
  } else {
    msg.channel.send(errorMsg(`Invalid command! Run ${pCommandPrefix}help to get a list of commands.`))
  }
} catch (error) {
  console.error(error)
}
})
client.login(discordToken)
