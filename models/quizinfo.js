'use strict';
module.exports = (sequelize, DataTypes) => {
  const QuizInfo = sequelize.define('QuizInfo', {
  	id: {
      primaryKey: true,
      type: DataTypes.STRING,
      defaultValue: function() {
      	let result = '';
	    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
	    for (let i = 0; i < 7; i++) {
	      result += characters.charAt(Math.floor(Math.random() * 6));
	    }
	    
	    return result;
      }
    },
    whatsapp: {
      type: DataTypes.STRING
    },
    quizName: {
      type: DataTypes.STRING
	  },
	  quizDate: {
	    type: DataTypes.DATE
	  },
	  quizTime: {
      type: DataTypes.INTEGER
	  },
	  deletedAt: {
      allowNull: true,
      type: DataTypes.DATE
    }
  }, {
      paranoid: true,
      timestamp: true
  });
  QuizInfo.associate = function(models) {
    // associations can be defined here
    QuizInfo.belongsTo(models.User, {
    	foreignKey: 'whatsapp'
    });

    QuizInfo.hasMany(models.Quiz, {
    	foreignKey: 'quizCode',
    	as: 'quizQuestions'
    });
  };
  return QuizInfo;
};