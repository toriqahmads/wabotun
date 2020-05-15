'use strict';
module.exports = (sequelize, DataTypes) => {
  const State = sequelize.define('State', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false
    },
    quizCode: {
      type: DataTypes.STRING
  	},
  	whatsapp: {
  	  type: DataTypes.STRING
  	},
    currentState: {
      type: DataTypes.JSON
    },
    result: {
      type: DataTypes.JSON
    },
    deletedAt: {
      allowNull: true,
      type: DataTypes.DATE
    }
  }, {
  	paranoid: true,
  	timestamp: true
  });
  State.associate = function(models) {
    // associations can be defined here
    State.belongsTo(models.User, {
      foreignKey: 'whatsapp'
    });

    State.belongsTo(models.QuizInfo, {
      foreignKey: 'quizCode',
      as: 'currentQuiz'
    });
  };
  return State;
};