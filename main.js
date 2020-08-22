const https = require("https");
const discord = require('discord.js');
const client = new discord.Client();
const apiKey = process.env.apiKey;
const discordToken = process.env.discordToken;
const commandPrefix = process.env.commandPrefix
const {Pool} = require('pg')
loginDetails = {
  user: process.env.user,
  host: process.env.host,
  database: process.env.database,
  password: process.env.password,
  port: process.env.dbport,
  ssl: {
    rejectUnauthorized: false
  }
}
const dbs = new Pool(loginDetails)
db = {
  profiles: [],
  users: []
}
async function test() {
  console.table((await dbs.query('select * from public."Profiles"')).rows)
  db.profiles = (await dbs.query('select * from public."Profiles"')).rows;
  db.users = (await dbs.query('select * from public."Users"')).rows;
  console.log(db.profiles);
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
        console.log(str)
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
    lastUpdate: 0
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
  }
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
    resolve(profile)
    return profile;
  }
}
function checkProfile(i) {
  return new Promise(async (resolve, reject) => {
    var profile = db.profiles[i];
    var res = await getProfile(profile.id);
    if (res && res.success) {
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
    await dbs.query('insert into public."Profiles" (id, members) values ($1, $2) ON CONFLICT (id) DO UPDATE SET members=$2',[profile.id,profile.members])
    console.log(profile);
    resolve(true);
    return true;
  }
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
client.on('ready', () => {
  console.log('Ready to go!');
});
client.on('message', async msg => {
  var message = msg.content.toLowerCase();
  if (message.startsWith(commandPrefix)) {
    var command = message.substring(commandPrefix.length).split(' ')
    if (command[0] == 'link') {
      var res = await getUUID(command[1]);
      if(res.length == 0 || res[0].id == null) {
        msg.channel.send('Invalid name!')
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
      var text = ""
      for (i in res.profiles) {
        const profile = {
          id: res.profiles[i].profile_id,
          name: res.profiles[i].cute_name.toLowerCase()
        };
        user.profiles.push(profile)
        if (text == "") {
          text = res.profiles[i].cute_name
        } else {
          text += ", " + res.profiles[i].cute_name
        }
      }
      db.users = db.users.filter(user => user.discordid != msg.author.id)
      db.users.push(user);
      console.log(user)
      await dbs.query('insert into public."Users" (discordid, profiles) values ($1, $2) ON CONFLICT (discordid) DO UPDATE SET profiles=$2',[user.discordid, user.profiles])
      msg.channel.send("Success! Available profiles: " + text)
    } else if(command[0] == "get") {
      var user = getUser(msg.author.id);
      console.log(user)
      if (user && user.discordid) {
        var profile = ''
        for (i in user.profiles) {
          if (command.length >= 2 && user.profiles[i].name == command[1].toLowerCase()) {
            profile = user.profiles[i].id
            break
          }
        }
        if (profile != '') {
          var data = '';
          for (i in db.profiles) {
            if (db.profiles[i].id == profile) {
              data = db.profiles[i]
              break
            }
          }
          if (data != '') {
            text = ''
            for (i in data.members) {
              if (text == '') {
                text = data.members[i].name + ": " + data.members[i].contribution;
              } else {
                text += '\n' + data.members[i].name + ": " + data.members[i].contribution;
              }
            }
            msg.channel.send(text)
          } else {
            msg.channel.send('This account is not being tracked!')
          }
        } else {
          var text = ''
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
      } else {
        msg.channel.send('You haven\'t linked your account!')
        return;
      }
    } else if (command[0] == 'track') {
      var user = getUser(msg.author.id);
      console.log(user)
      if (user && user.discordid) {
        var profile = ''
        var profilenum = 0
        for (i in user.profiles) {
          if (command.length >= 2 && user.profiles[i].name == command[1].toLowerCase()) {
            profile = user.profiles[i].id
            profilenum = i;
            break
          }
        }
        if (profile != '') {
          var data = '';
          for (i in db.profiles) {
            if (db.profiles[i].id == profile) {
              data = db.profiles[i]
              break
            }
          }
          if (data == '') {
            var tempProfile = newProfile(profile);
            db.profiles.push(tempProfile);
            await dbs.query('insert into public."Profiles" (id, members) values ($1, $2) ON CONFLICT (id) DO UPDATE SET members=$2',[tempProfile.id,tempProfile.members])
            msg.channel.send('Now tracking ' + user.profiles[profilenum].name)
          } else {
            msg.channel.send('This account is already being tracked!')
          }
        } else {
          var text = ''
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
      } else {
        msg.channel.send('You haven\'t linked your account!')
        return;
      }
    }
  }
})
client.login(discordToken)
