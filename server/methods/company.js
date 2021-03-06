'use strict';
import { _ } from 'meteor/underscore';
import { check, Match } from 'meteor/check';
import { Meteor } from 'meteor/meteor';
import { dbCompanies } from '../../db/dbCompanies';
import { dbDirectors } from '../../db/dbDirectors';
import { dbOrders } from '../../db/dbOrders';
import { dbProducts } from '../../db/dbProducts';
import { dbLog } from '../../db/dbLog';
import { dbPrice } from '../../db/dbPrice';

Meteor.methods({
  revokeCompany(companyName, message) {
    check(this.userId, String);
    check(companyName, String);
    check(message, String);
    revokeCompany(Meteor.user(), companyName, message);

    return true;
  }
});

function revokeCompany(user, companyName, message) {
  if (! user.profile.isAdmin) {
    throw new Meteor.Error(401, '權限不足！');
  }
  const companyData = dbCompanies.findOne({companyName});
  if (! companyData) {
    throw new Meteor.Error(404, '找不到名稱為「' + companyName + '」的公司！');
  }
  dbLog.insert({
    logType: '公司撤銷',
    username: [companyData.manager],
    companyName: companyName,
    message: message,
    createdAt: new Date()
  });
  dbCompanies.remove({
    _id: companyData._id
  });
  dbDirectors.remove({
    companyName: companyName
  });
  dbOrders.remove({
    companyName: companyName
  });
  dbProducts.remove({
    companyName: companyName
  });
}

Meteor.methods({
  revokeManagerQualification(username, message) {
    check(this.userId, String);
    check(message, String);
    revokeManagerQualification(Meteor.user(), username, message);
  }
});

function revokeManagerQualification(admin, username, message) {
  if (! admin.profile.isAdmin) {
    throw new Meteor.Error(401, '使用者並非管理員！');
  }
  const user = Meteor.users.findOne({username});
  if (! user) {
    throw new Meteor.Error(404, '找不到使用者「' + username + '」！');
  }
  dbLog.insert({
    logType: '取消資格',
    username: [admin.username, username],
    message: message,
    createdAt: new Date()
  });
  dbCompanies.find({
    $or: [
      {
        manager: username
      },
      {
        candidateList: username
      }
    ]
  }, {
    disableOplog: true
  }).forEach((companyData) => {
    if (companyData.manager === username) {
      companyData.manager = '';
    }
    const {candidateList, voteList} = companyData;
    const candidateIndex = _.indexOf(candidateList, username);
    if (candidateIndex !== -1) {
      candidateList.splice(candidateIndex, 1);
      voteList.splice(candidateIndex, 1);
    }
    dbCompanies.update({
      _id: companyData._id
    }, {
      $set: {
        manager: companyData.manager,
        candidateList: candidateList,
        voteList: voteList
      }
    });
  });
}

Meteor.methods({
  editCompany(companyName, newCompanyData) {
    check(this.userId, String);
    check(companyName, String);
    check(newCompanyData, {
      tags: [String],
      pictureSmall: new Match.Maybe(String),
      pictureBig: new Match.Maybe(String),
      description: String
    });
    editCompany(Meteor.user(), companyName, newCompanyData);

    return true;
  }
});

function editCompany(user, companyName, newCompanyData) {
  const companyData = dbCompanies.findOne({companyName});
  if (! companyData) {
    throw new Meteor.Error(404, '找不到名稱為「' + companyName + '」的公司！');
  }
  if (user.username !== companyData.manager) {
    throw new Meteor.Error(401, '使用者並非該公司的經理人！');
  }
  dbLog.insert({
    logType: '經理管理',
    username: [companyData.manager],
    companyName: companyName,
    createdAt: new Date()
  });
  dbCompanies.update({
    _id: companyData._id
  }, {
    $set: newCompanyData
  });
}

Meteor.methods({
  resignManager(companyName) {
    check(this.userId, String);
    check(companyName, String);
    resignManager(Meteor.user(), companyName);

    return true;
  }
});

export function resignManager(user, companyName) {
  const companyData = dbCompanies.findOne({companyName});
  if (! companyData) {
    throw new Meteor.Error(404, '找不到名稱為「' + companyName + '」的公司！');
  }
  if (user.username !== companyData.manager) {
    throw new Meteor.Error(401, '使用者並非該公司的經理人！');
  }
  dbLog.insert({
    logType: '辭職紀錄',
    username: [user.username],
    companyName: companyName,
    createdAt: new Date()
  });
  const {candidateList, voteList} = companyData.candidateList;
  const candidateIndex = _.indexOf(candidateList, user.username);
  if (candidateIndex !== -1) {
    candidateList.splice(candidateIndex, 1);
    voteList.splice(candidateIndex, 1);
  }
  dbCompanies.update({
    _id: companyData._id
  }, {
    $set: {
      manager: '!none',
      candidateList: candidateList,
      voteList: voteList
    }
  });
}

Meteor.methods({
  contendManager(companyName) {
    check(this.userId, String);
    check(companyName, String);
    contendManager(Meteor.user(), companyName);

    return true;
  }
});

export function contendManager(user, companyName) {
  const companyData = dbCompanies.findOne({companyName});
  if (! companyData) {
    throw new Meteor.Error(404, '找不到名稱為「' + companyName + '」的公司！');
  }
  if (user.username === companyData.manager) {
    throw new Meteor.Error(403, '使用者已經是該公司的經理人了！');
  }
  const {candidateList, voteList} = companyData;
  if (_.contains(candidateList, user.username)) {
    throw new Meteor.Error(403, '使用者已經是該公司的經理人候選者了！');
  }
  if (user.profile.revokeQualification) {
    throw new Meteor.Error(401, '使用者的競選經理人資格已經被取消了！');
  }
  candidateList.push(user.username);
  voteList.push([]);
  dbLog.insert({
    logType: '參選紀錄',
    username: [user.username],
    companyName: companyName,
    createdAt: new Date()
  });
  dbCompanies.update({
    _id: companyData._id
  }, {
    $set: {
      candidateList: candidateList,
      voteList: voteList
    }
  });
}

Meteor.methods({
  supportCandidate(companyName, username) {
    check(this.userId, String);
    check(companyName, String);
    check(username, String);
    supportCandidate(Meteor.user(), companyName, username);

    return true;
  }
});

export function supportCandidate(director, companyName, username) {
  const companyData = dbCompanies.findOne({companyName});
  if (! companyData) {
    throw new Meteor.Error(404, '找不到名稱為「' + companyName + '」的公司！');
  }
  const {candidateList, voteList} = companyData;
  const candidateIndex = _.indexOf(candidateList, username);
  if (candidateIndex === -1) {
    throw new Meteor.Error(403, username + '並未競爭「' + companyName + '」公司經理人，無法進行支持！');
  }
  if (_.contains(voteList[candidateIndex], director.username)) {
    throw new Meteor.Error(403, '使用者已經正在支持' + username + '擔任「' + companyName + '」公司經理人了，無法再次進行支持！');
  }
  const directorName = director.username;
  const directorData = dbDirectors.findOne({
    companyName: companyName,
    username: directorName
  });
  if (! directorData) {
    throw new Meteor.Error(401, '使用者並非「' + companyName + '」公司的董事，無法支持經理人！');
  }
  const newVoteList = _.map(voteList, (votes) => {
    return _.without(votes, directorName);
  });
  newVoteList[candidateIndex].push(directorName);

  dbLog.insert({
    logType: '支持紀錄',
    username: [director.username, username],
    companyName: companyName,
    createdAt: new Date()
  });
  dbCompanies.update({
    _id: companyData._id
  }, {
    $set: {
      voteList: newVoteList
    }
  });
}

Meteor.methods({
  changeChairmanTitle(companyName, chairmanTitle) {
    check(this.userId, String);
    check(companyName, String);
    check(chairmanTitle, String);
    changeChairmanTitle(Meteor.user(), companyName, chairmanTitle);

    return true;
  }
})

function changeChairmanTitle(user, companyName, chairmanTitle) {
  const username = user.username;
  const chairmanData = dbDirectors.findOne({companyName}, {
    sort: {
      stocks: -1
    },
    limit: 1
  });
  if (chairmanData.username !== username) {
    throw new Meteor.Error(401, '使用者並非該公司的董事長，無法修改董事長頭銜！');
  }
  dbCompanies.update({companyName}, {
    $set: {
      chairmanTitle: chairmanTitle
    }
  });
}

Meteor.publish('stockSummary', function(keyword, isOnlyShowMine, sortBy, offset) {
  check(keyword, String);
  check(isOnlyShowMine, Boolean);
  check(sortBy, new Match.OneOf('lastPrice', 'totalValue', 'createdAt'));
  check(offset, Match.Integer);
  const filter = {};
  if (keyword) {
    keyword = keyword.replace(/\\/g, '\\\\');
    const reg = new RegExp(keyword, 'i');
    filter.$or =[
      {
        companyName: reg
      },
      {
        manager: reg
      },
      {
        tags: reg
      }
    ];
  }
  const user = this.userId ? Meteor.users.findOne(this.userId) : null;
  const username = user ? user.username : '';
  if (username && isOnlyShowMine) {
    const orderCompanyNameList = dbOrders.find({username}).map((orderData) => {
      return orderData.companyName;
    });
    const directoryCompanyNameList = dbDirectors.find({username}).map((orderData) => {
      return orderData.companyName;
    });
    filter.companyName = {
      $in: _.unique(orderCompanyNameList.concat(directoryCompanyNameList))
    };
  }
  const sort = {
    [sortBy]: -1
  };
  const skip = offset;
  const limit = 10 + offset;
  const fields = {
    pictureBig: 0
  };

  let initialized = false;
  let total = dbCompanies.find(filter).count();
  this.added('pagination', 'stockSummary', {total});

  const observer = dbCompanies
    .find(filter, {sort, skip, limit, fields})
    .observeChanges({
      added: (id, fields) => {
        this.added('companies', id, fields);
        if (initialized) {
          total += 1;
          this.changed('pagination', 'stockSummary', {total});
        }
      },
      changed: (id, fields) => {
        this.changed('companies', id, fields);
      },
      removed: (id) => {
        this.removed('companies', id);
        if (initialized) {
          total -= 1;
          this.changed('pagination', 'stockSummary', {total});
        }
      }
    });

  initialized = true;
  this.ready();
  this.onStop(() => {
    observer.stop();
  });
});

Meteor.publish('queryChairman', function(companyName) {
  check(companyName, String);

  return dbDirectors.find({companyName}, {
    limit: 1,
    sort: {
      stocks: -1
    }
  });
});

Meteor.publish('queryOwnStocks', function(companyName) {
  check(companyName, String);
  if (this.userId) {
    const username = Meteor.users.findOne(this.userId).username;

    return dbDirectors.find({username, companyName});
  }

  return null;
});

Meteor.publish('queryMyOrder', function() {
  if (this.userId) {
    const username = Meteor.users.findOne(this.userId).username;

    return dbOrders.find({username});
  }

  return null;
});

Meteor.publish('companyDetail', function(companyName) {
  check(companyName, String);
  const servenDayAgo = new Date(Date.now() - 604800000);

  return [
    dbCompanies.find({companyName}, {
      fields: {
        pictureSmall: 0
      }
    }),
    dbPrice.find({
      companyName: companyName,
      createdAt: {
        $gte: servenDayAgo
      }
    })
  ];
});

Meteor.publish('todayDealAmount', function(companyName) {
  check(companyName, String);
  const todayBegin = new Date().setHours(0, 0, 0, 0);
  const filter = {
    logType: '交易紀錄',
    companyName: companyName,
    createdAt: {
      $gte: todayBegin
    }
  };

  let total = 0;
  this.added('pagination', 'todayDealAmount', {total});

  const observer = dbLog
    .find(filter)
    .observeChanges({
      added: (id, fields) => {
        console.log(fields);
        total += fields.amount;
        this.changed('pagination', 'todayDealAmount', {total});
      }
    });
  this.ready();
  this.onStop(() => {
    observer.stop();
  });
});

Meteor.publish('companyDirector', function(companyName, offset) {
  check(companyName, String);

  let initialized = false;
  let total = dbDirectors.find({companyName}).count();
  this.added('pagination', 'companyDirector', {total});

  const observer = dbDirectors
    .find({companyName}, {
      sort: {
        stocks: -1
      },
      skip: offset,
      limit: 10 + offset
    })
    .observeChanges({
      added: (id, fields) => {
        this.added('directors', id, fields);
        if (initialized) {
          total += 1;
          this.changed('pagination', 'companyDirector', {total});
        }
      },
      changed: (id, fields) => {
        this.changed('directors', id, fields);
      },
      removed: (id) => {
        this.removed('directors', id);
        if (initialized) {
          total -= 1;
          this.changed('pagination', 'companyDirector', {total});
        }
      }
    });
  initialized = true;
  this.ready();
  this.onStop(() => {
    observer.stop();
  });
});

Meteor.publish('companyLog', function(companyName, offset) {
  check(companyName, String);

  let initialized = false;
  let total = dbLog.find({companyName}).count();
  this.added('pagination', 'companyLog', {total});

  const observer = dbLog
    .find({companyName}, {
      sort: {
        createdAt: -1
      },
      skip: offset,
      limit: 30
    })
    .observeChanges({
      added: (id, fields) => {
        this.added('log', id, fields);
        if (initialized) {
          total += 1;
          this.changed('pagination', 'companyLog', {total});
        }
      },
      changed: (id, fields) => {
        this.changed('log', id, fields);
      },
      removed: (id) => {
        this.removed('log', id);
        if (initialized) {
          total -= 1;
          this.changed('pagination', 'companyLog', {total});
        }
      }
    });
  initialized = true;
  this.ready();
  this.onStop(() => {
    observer.stop();
  });
});

Meteor.publish('companyOrder', function(companyName, type, offset) {
  check(companyName, String);
  check(type, new Match.OneOf('購入', '賣出'));

  const paginationId = 'companyOrder' + type;
  let initialized = false;
  let total = dbOrders.find({companyName}).count();
  this.added('pagination', paginationId, {total});

  const observer = dbOrders.find(
      {
        companyName: companyName,
        orderType: type
      },
      {
        sort: {
          unitPrice: type === '賣出' ? 1 : -1
        },
        skip: offset,
        limit: 10
      }
    )
    .observeChanges({
      added: (id, fields) => {
        this.added('orders', id, fields);
        if (initialized) {
          total += 1;
          this.changed('pagination', paginationId, {total});
        }
      },
      changed: (id, fields) => {
        this.changed('orders', id, fields);
      },
      removed: (id) => {
        this.removed('orders', id);
        if (initialized) {
          total -= 1;
          this.changed('pagination', paginationId, {total});
        }
      }
    });
  initialized = true;
  this.ready();
  this.onStop(() => {
    observer.stop();
  });
});

Meteor.publish('companyCurrentProduct', function(companyName) {
  check(companyName, String);
  const overdue = 1;

  return dbProducts.find({companyName, overdue});
});

Meteor.publish('companyOldProduct', function(companyName, offset) {
  check(companyName, String);
  const overdue = 2;

  return dbProducts.find({companyName, overdue}, {
    sort: {
      createdAt: -1
    },
    skip: offset,
    limit: 10 + offset
  });
});
