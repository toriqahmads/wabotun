'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable('QuizInfos', {
      id: {
        primaryKey: true,
        type: Sequelize.STRING
      },
      whatsapp: {
        type: Sequelize.STRING
      },
      quizName: {
        type: Sequelize.STRING
      },
      quizDate: {
        type: Sequelize.DATE
      },
      quizTime: {
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
    }, {});
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable('QuizInfos');
  }
};