'use strict';
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      primaryKey: true,
      type: DataTypes.STRING
    },
    currentState: {
      type: DataTypes.JSON
    },
    firstName: {
      type: DataTypes.STRING
    },
    lastName: {
      type: DataTypes.STRING
    },
    email: {
      type: DataTypes.STRING,
        unique: {
       args: true,
       msg: 'Email already in use!'
      },
      validate: {
       isEmail: true
      }
    },
    currentState: {
      type: DataTypes.JSON
    },
    deletedAt: {
      allowNull: true,
      type: DataTypes.DATE
    }
  }, {
  	indexes: [
      {
        unique: true,
        fields: ['email']
      }
    ],
  	timestamp: true,
  	paranoid: true
  });

  User.associate = function(models) {
    // associations can be defined here
    User.hasMany(models.State, {
      as: 'userState',
      foreignKey: 'whatsapp'
    });

    User.hasMany(models.QuizInfo, {
      as: 'userHaveQuizzes',
      foreignKey: 'whatsapp'
    });
  };
  return User;
};