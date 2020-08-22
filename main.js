const https = require("https");
const discord = require('discord.js');
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const client = new discord.Client();
const apiKey = process.env.apiKey;
const discordToken = process.env.discordToken;
const commandPrefix = process.env.commandPrefix
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
    resolve()
  })
}
updateLoop();
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
client.on('ready', () => {
  console.log('Ready to go!');
});
client.on('message', async msg => {
  if (msg.author.bot) return;
  var message = msg.content.toLowerCase();
  let pCommandPrefix = commandPrefix;
  if (msg.channel.type == "dm") {
    pCommandPrefix = "";
  } else {
    pCommandPrefix = getGuildPrefix(msg.channel.guild.id)
  }
  if(!message.startsWith(pCommandPrefix)) return;
  var args = message.substring(pCommandPrefix.length).split(' ');
  if (args[0] == "link") {
    let res = await getUUID(args[1]);
    if (res.length == 0 || res[0].id == null) {
      msg.channel.send('Invalid name!');
      return;
    }
    res = await getProfiles(res[0].id);
    if (!res.success) {
      msg.channel.send('Not a hypixel user!')
      return;
    }
    const user = {
      discordid: msg.author.id,
      profiles: []
    }
    let text = ""
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
    }
    db.users = db.users.filter(user => user.discordid != msg.author.id)
    db.users.push(user);
    await dbs.query('insert into public."Users" (discordid, profiles) values ($1, $2) ON CONFLICT (discordid) DO UPDATE SET profiles=$2',[user.discordid, user.profiles])
    msg.channel.send("Success! Available profiles: " + text)
  } else if(args[0] == "get") {
    user = getUser(msg.author.id);
    if (!user || !user.discordid) {
      msg.channel.send('You haven\'t linked your account!')
      return;
    }
    profile = ''
    for (i in user.profiles) {
      if (args.length >= 2 && user.profiles[i].name == args[1].toLowerCase()) {
        profile = user.profiles[i].id
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
      msg.channel.send('Invalid profile! Your profiles: ' + text)
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
      for (i in data.members) {
        if (data.members[i].contribution < 0) {
          text += "-";
        } else if (data.members[i].contribution > 0) {
          text += "+"
        }
        text += data.members[i].name + ": " + data.members[i].contribution + '\n';
      }
      msg.channel.send("```DIFF\n" + text + `total: ${data.total}` + "```")
    } else {
      msg.channel.send('This account is not being tracked!')
    }
  } else if (args[0] == "track") {
    user = getUser(msg.author.id);
    if (!user || !user.discordid) {
      msg.channel.send('You haven\'t linked your account!')
      return;
    }
    profile = ''
    let profilenum = 0
    for (i in user.profiles) {
      if (args.length >= 2 && user.profiles[i].name == args[1].toLowerCase()) {
        profile = user.profiles[i].id
        profilenum = i;
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
        msg.channel.send('Now tracking ' + user.profiles[profilenum].name)
      } else {
        msg.channel.send('This account is already being tracked!')
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
      msg.channel.send('Invalid profile! Your profiles: ' + text)
      return;
    }
  } else if (args[0] == "profiles") {
    user = getUser(msg.author.id);
    if (!user || !user.discordid) {
      msg.channel.send('You haven\'t linked your account!')
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
    msg.channel.send("Your profiles: " + text);
  } else if (args[0] == "setprefix") {
    if (!msg.member.permissions.has("ADMINISTRATOR")) {
      msg.channel.send("You don't have permission to do this!");
      return
    }
    if (args.length <= 1) {
      msg.channel.send("Please provide a prefix!");
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
    msg.channel.send(`Command prefix set to ${args[1]}`);
  }else if(args[0] == "help") {
    msg.channel.send("```help -- lists commands\n" +
                    "link <username> -- will link your hypixel account to the bot\n" +
                    "profiles -- lists profiles linked to your account\n" +
                    "track <profile> -- to start tracking a profile\n" +
                    "get <profile> -- will return the latest bank stats" +
                    "setprefix <prefix> -- sets the bot's comamnd prefix" +
                    "```")
    return;
  } else {
    msg.channel.send(`Invalid command! Run ${pCommandPrefix}help to get a list of commands.`)
  }
})
client.login(discordToken)
