'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable('Quizzes', {
      id: {
        allowNull: false,
        autoIncrement: false,
        primaryKey: true,
        type: Sequelize.UUID
      },
      quizCode: {
        type: Sequelize.STRING
      },
      question: {
        type: Sequelize.TEXT('tiny')
      },
      options: {
        type: Sequelize.JSON
      },
      correctAnswer: {
        type: Sequelize.CHAR
      },
      correctPoint: {
        type: Sequelize.INTEGER
      },
      wrongPoint: {
        type: Sequelize.INTEGER
      },
      notAnsweredPoint: {
        type: Sequelize.INTEGER
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      deletedAt: {
        allowNull: true,
        type: Sequelize.DATE
      }
    });
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable('Quizzes');
  }
};