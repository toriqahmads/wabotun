'use strict';
module.exports = (sequelize, DataTypes) => {
  const Quiz = sequelize.define('Quiz', {
  	id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false
    },
    quizCode: {
      type: DataTypes.STRING,
    },
	  question: {
	    type: DataTypes.TEXT('tiny')
	  },
	  options: {
	    type: DataTypes.JSON
	  },
	  correctAnswer: {
      type: DataTypes.CHAR
	  },
	  correctPoint: {
	    type: DataTypes.INTEGER
	  },
	  wrongPoint: {
	    type: DataTypes.INTEGER
	  },
	  notAnsweredPoint: {
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
  Quiz.associate = function(models) {
    // associations can be defined here
    Quiz.belongsTo(models.QuizInfo, {
      foreignKey: 'quizCode'
    })
  };
  return Quiz;
};