const _ = require('lodash');
const Models = require('./models');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');

const SESSION_FILE_PATH = './session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
}

const client = new Client({ puppeteer: { headless: true }, session: sessionCfg });

client.on('qr', (qr) => {
    // Generate and scan this code with your phone
    console.log('QR RECEIVED', qr);
    qrcode.generate(qr, {small: true});
});

client.on('authenticated', (session) => {
    sessionCfg = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
        if (err) {
            console.error(err);
        }
    });
});

client.on('auth_failure', msg => {
    // Fired if session restore was unsuccessfull
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('message', async msg => {
    const message = msg.body;
    try {
        let user = await Models.User.findOne({
            where: {
                id: msg.from
            },
            include: [{
                model: Models.State,
                as: 'userState',
                include: {
                    model: Models.QuizInfo,
                    as: 'currentQuiz',
                    include: {
                        model: Models.Quiz,
                        as: 'quizQuestions'
                    }
                }
            }, {
                model: Models.QuizInfo,
                as: 'userHaveQuizzes'
            }]
        });

        if (!user) user = await Models.User.create({
            id: msg.from,
            currentState: {
                currentStep: '',
                nextCommand: '',
                currentQuestion: {},
                currentQuizCode: '',
                currentTimeUsed: 0,
                answered: [],
                correct: 0,
                point: 0,
                currentQuizCreate: ''
            }
        });

        if (user.currentState.currentQuizCode !== '') {
            const indexState = _.findIndex(user.userState, { quizCode: user.currentState.currentQuizCode });
            if (indexState > -1) user.userState = user.userState[indexState];
        }

        if (message.toLowerCase() == 'ping') {
            msg.reply('pong');
        }

        else if (message.toLowerCase() == 'help') {
            msg.reply(`daftar : untuk mendaftar dan melengkapi data diri\n
                mulai ujian : untuk memulai ujian\n
                buat ujian : untuk membuat ujian baru\n
                a|b|c|d|e : untuk menjawab soal\n
                no [no soal] : untuk loncat ke soal no [no soal]\n
                selanjutnya : untuk loncat ke soal no selanjutnya\n
                sebelumnya : untuk loncat ke soal no sebelumnya`)
        }

        else if ((message.toLowerCase() == 'daftar' 
            ||
            message.match(/^[a-zA-Z\s]{1,25}$/i)
            ||
            message.match(/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/i)
           ) 
        && 
            (user.firstName === null || user.lastName === null || user.email === null)
        && 
            (message.toLowerCase() != 'buat ujian' && message.toLowerCase() != 'sebelumnya' && message.toLowerCase() != 'selanjutnya' && message.toLowerCase() != 'help')
        ) {
            if (user.firstName === null && message.toLowerCase() == 'daftar') {
                user.currentState.currentStep = 'daftar';
                user.currentState.nextCommand = 'Masukkan nama depan Anda (Maksimal 25 karakter termasuk spasi)';
                user.changed('currentState', true);
                await user.save();

                msg.reply(user.currentState.nextCommand);
            }
            else if (user.firstName === null && message.match(/^[a-zA-Z\s]{1,25}$/i) && user.currentState.currentStep == 'daftar') {
                user.currentState.currentStep = 'daftar';
                user.currentState.nextCommand = 'Masukkan nama belakang Anda (Maksimal 25 karakter termasuk spasi)';
                user.firstName = message;
                user.changed('currentState', true);
                await user.save();

                msg.reply(user.currentState.nextCommand);
            }
            else if (user.lastName === null && message.match(/^[a-zA-Z\s]{1,25}$/i) && user.currentState.currentStep == 'daftar') {
                user.currentState.currentStep = 'daftar';
                user.currentState.nextCommand = 'Masukkan email Anda';
                user.lastName = message;
                user.changed('currentState', true);
                await user.save();

                msg.reply(user.currentState.nextCommand);
            }
            else if (user.email === null 
                &&
                message.match(/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/i)
                &&
                user.currentState.currentStep == 'daftar'
            ) {
                user.currentState.currentStep = 'daftar';
                user.currentState.nextCommand = `Pendaftaran berhasil! Silahkan ketik help untuk melihat fitur yang tersedia`;
                user.email = message
                user.changed('currentState', true);
                await user.save();

                msg.reply(user.currentState.nextCommand);
            }
            else if (user.firstName && user.lastName && user.email) {
                user.currentState.currentStep = 'daftar';
                user.currentState.nextCommand = `Anda sudah terdaftar.\nSilahkan ketik help untuk melihat fitur yang tersedia`;
                user.changed('currentState', true);
                await user.save();

                msg.reply(user.currentState.nextCommand);
            }
        }

        else if ((message.toLowerCase() == 'mulai ujian' 
                || message.match(/^[a-zA-Z]{6,6}$/))
            && (user.firstName && user.lastName && user.email)
        ) {
            if (message.match(/^[a-zA-Z]{6,6}$/) && user.currentState.currentStep == 'mulai ujian') {
                let quiz = await Models.QuizInfo.findOne({
                    where: {
                        id: message
                    },
                    include: [{
                        model: Models.Quiz,
                        as: 'quizQuestions'
                    }]
                });

                if (quiz && quiz.quizQuestions.length > 0) {
                    const haveQuizState = await Models.State.findOne({
                        where: {
                            whatsapp: msg.from,
                            quizCode: message
                        }
                    });

                    if (haveQuizState) {
                        user.currentState = haveQuizState.currentState;
                        user.currentState.currentStep = 'mulai ujian';
                        user.changed('currentState', true);
                        await user.save();
                        await Models.State.update({
                            currentState: user.currentState
                        }, {
                            where: {
                                whatsapp: msg.from,
                                quizCode: message
                            }
                        });
                    } 
                    else {
                        user.currentState.currentQuizCode = message;
                        user.currentState.currentStep = 'mulai ujian';
                        user.currentState.nextCommand = quiz.quizQuestions[0].question;
                        user.currentState.currentQuestion = { questionId: quiz.quizQuestions[0].id, index: 0 };
                        await Models.State.create({
                            whatsapp: msg.from,
                            quizCode: message,
                            currentState: user.currentState
                        });
                    }

                    client.sendMessage(msg.from, user.currentState.nextCommand);
                } 
                else {
                    msg.reply(`Kode ujian ${message} tidak ditemukan atau soal belum diupload`);
                }    
            } else {
                user.currentState.currentStep = 'mulai ujian';
                user.currentState.nextCommand = 'Masukkan kode ujian untuk memulai ujian';
                user.changed('currentState', true);
                await user.save();

                msg.reply(user.currentState.nextCommand);
            }
        }

        else if ((user.currentState.currentStep == 'mulai ujian'
            &&
            user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index].some(s => s.options[message.toLowerCase()] === message.toLowerCase()))
            && (user.firstName && user.lastName && user.email)
        ) {
            if(user.userState.currentQuiz.quizQuestions.length < 1) {
                client.sendMessage(
                    msg.from, 
                    `Anda belum memulai ujian, silahkan mulai ujian dengan perintah mulai ujian`
                );
            } else {
                const indexAnswered = _.findIndex(user.userState.currentState.answered, { questionId: user.currentState.currentQuestion.id });
                if(indexAnswered === -1) {
                    if (user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index].correctAnswer.toLowerCase() === message.toLowerCase()) {
                        user.currentState.point += user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index].correctPoint;
                        user.currentState.correct += 1;
                    } else {
                        user.currentState.point -= user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index].wrongPoint;
                    }
                } else {
                    if (user.currentState.answered[indexAnswered].answer.toLowerCase() !== message.toLowerCase()) {
                        if (user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index].correctAnswer.toLowerCase() !== user.currentState.answered[indexAnswered].answer.toLowerCase()
                            &&
                            user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index].correctAnswer.toLowerCase() === message.toLowerCase()
                        ) {
                            user.currentState.point += user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index].correctPoint;
                            user.currentState.correct += 1;
                            user.currentState.point += user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index].wrongPoint;
                        }

                        if (user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index].correctAnswer.toLowerCase() === user.currentState.answered[indexAnswered].answer.toLowerCase()
                            && 
                            user.currentState.answered[indexAnswered].answer.toLowerCase() !== message.toLowerCase()
                        ) {
                            user.currentState.point -= user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index].wrongPoint;
                            user.currentState.correct -= 1;
                            user.currentState.point -= user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index].correctPoint;
                        }

                        user.currentState.answered[indexAnswered].answer = message.toLowerCase();
                    }
                }

                user.currentState.answered.push({ answered: message.toLowerCase(), questionId: user.currentState.currentQuestion.id });
                user.currentState.currentQuestion.id = user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index + 1].id;
                user.currentState.currentQuestion.index = user.currentState.currentQuestion.index + 1;
                user.currentState.nextCommand = user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index + 1].question;
                user.changed('currentState', true);
                await user.save();
                await Models.State.update({
                    currentState: user.currentState
                }, {
                    where: {
                        whatsapp: msg.from,
                        quizCode: user.currentState.quizCode
                    }
                });  

                if (user.currentState.currentQuestion.index === (user.userState.currentQuiz.quizQuestions.length - 1)) {
                    client.sendMessage(
                        msg.from, 
                        `Anda telah menjawab semua soal, jika ingin mengoreksi jawaban silahkan ketik \`no [NOSOAL]\``
                    );
                } else {
                    client.sendMessage(msg.from, user.currentState.nextCommand);
                }
            }
        }

        else if ((message.toLowerCase().match(/^no\s+\d+$/i) && user.currentState.currentStep == 'mulai ujian')
            && (user.firstName && user.lastName && user.email)
        ) {
            const no = Number.parseInt(message.split(' ')[1]) - 1;
            if (typeof(user.userState.currentQuiz.quizQuestions[no]) === 'undefined') {
                client.sendMessage(
                    msg.from, 
                    `Nomor soal yang Anda masukkan tidak tersedia. No soal terakhir adalah ${user.userState.currentQuiz.quizQuestions.length}`
                );
            }
            else {
                user.currentState.currentQuestion.id = user.userState.currentQuiz.quizQuestions[no].id;
                user.currentState.currentQuestion.index = no;
                user.currentState.nextCommand = user.userState.currentQuiz.quizQuestions[no].question;
                user.changed('currentState', true);
                await user.save();
                await Models.State.update({
                    currentState: user.currentState
                }, {
                    where: {
                        whatsapp: msg.from,
                        quizCode: user.currentState.quizCode
                    }
                });

                client.sendMessage(msg.from, user.currentState.nextCommand);
            }
        }

        else if ((message.toLowerCase() === 'selanjutnya' && user.currentState.currentStep == 'mulai ujian')
            && (user.firstName && user.lastName && user.email)
        ) {
            if ((user.currentState.currentQuestion.index + 1) > user.userState.currentQuiz.quizQuestions.length) {
                client.sendMessage(msg.from, `Anda sedang mengerjakan soal terakhir`);
            } else {
                user.currentState.answered.push({ answered: message.toLowerCase(), questionId: user.currentState.currentQuestion.id });
                user.currentState.currentQuestion.id = user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index + 1].id;
                user.currentState.currentQuestion.index = user.currentState.currentQuestion.index + 1;
                user.currentState.nextCommand = user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index + 1].question;
                user.changed('currentState', true);
                await user.save();
                await Models.State.update({
                    currentState: user.currentState
                }, {
                    where: {
                        whatsapp: msg.from,
                        quizCode: user.currentState.quizCode
                    }
                });

                client.sendMessage(msg.from, user.currentState.nextCommand);
            }
        }

        else if ((message.toLowerCase() === 'sebelumnya' && user.currentState.currentStep == 'mulai ujian')
            && (user.firstName && user.lastName && user.email)
        ) {
            if ((user.currentState.currentQuestion.index - 1) < 0) {
                client.sendMessage(msg.from, `Anda sedang mengerjakan soal no pertama`);
            } else {
                user.currentState.answered.push({ answered: message.toLowerCase(), questionId: user.currentState.currentQuestion.id });
                user.currentState.currentQuestion.id = user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index - 1].id;
                user.currentState.currentQuestion.index = user.currentState.currentQuestion.index - 1;
                user.currentState.nextCommand = user.userState.currentQuiz.quizQuestions[user.currentState.currentQuestion.index - 1].question;
                user.changed('currentState', true);
                await user.save();
                await Models.State.update({
                    currentState: user.currentState
                }, {
                    where: {
                        whatsapp: msg.from,
                        quizCode: user.currentState.quizCode
                    }
                });
                 
                client.sendMessage(msg.from, user.currentState.nextCommand);
            }
        }

        else if ((message.toLowerCase() == 'buat ujian'
                || message.match(/^([12]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))$/)
                || message.match(/^[\w\s]{10,50}$/)
                || message.match(/^[0-9]+$/))
            && (user.firstName && user.lastName && user.email)
        ) {
            let quizInfo
            if (user.currentState.currentQuizCreate !== null) {
                quizInfo = await Models.QuizInfo.findOne({
                    where: {
                        id: user.currentState.currentQuizCreate
                    },
                    include: [{
                        model: Models.Quiz,
                        as: 'quizQuestions'
                    }]
                });
            }
            
            if (message.toLowerCase() == 'buat ujian') {
                if (user.currentState.currentQuizCreate === null) {
                    quizInfo = await Models.QuizInfo.create({
                        whatsapp: msg.from
                    });
                }

                user.currentState.currentStep = 'buat ujian';
                user.currentState.currentQuizCreate = quizInfo.id;
                user.currentState.nextCommand = `Masukkan nama ujian (Minimal 10 karakter. Maksimal 50 karakter termasuk spasi)`;
                user.changed('currentState', true);
                await user.save();

                msg.reply(user.currentState.nextCommand);
            }

            else if (quizInfo.quizName === null && message.toLowerCase() != 'buat ujian' && user.currentState.currentStep == 'buat ujian' && message.match(/^[\w\s]{10,50}$/)) {
                user.currentState.currentStep = 'buat ujian';
                user.currentState.nextCommand = `Masukkan tanggal ujian (YYYY-MM-YY)`;
                user.changed('currentState', true);
                await user.save();
                await Models.QuizInfo.update({
                    quizName: message
                }, {
                    where: {
                        id: user.currentState.currentQuizCreate
                    }
                });

                msg.reply(user.currentState.nextCommand);
            }

            else if (quizInfo.quizDate === null && message.match(/^([12]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))$/)) {
                user.currentState.currentStep = 'buat ujian';
                user.currentState.nextCommand = `Masukkan waktu ujian (Dalam menit)`;
                user.changed('currentState', true);
                await user.save();
                await Models.QuizInfo.update({
                    quizDate: new Date(message)
                }, {
                    where: {
                        id: user.currentState.currentQuizCreate
                    }
                });

                msg.reply(user.currentState.nextCommand);
            } 

            else if (quizInfo.quizTime === null && message.match(/^[0-9]+$/)) {
                user.currentState.currentStep = 'buat ujian';
                user.currentState.nextCommand = `Silahkan mengisi soal sesuai dengan template berikut dan kirimkan kembali dalam format .csv`;
                user.changed('currentState', true);
                await user.save();
                await Models.QuizInfo.update({
                    quizTime: Number.parseInt(message)
                }, {
                    where: {
                        id: user.currentState.currentQuizCreate
                    }
                });

                msg.reply(user.currentState.nextCommand);
            } 

            else if (quizInfo.quizQuestions.length < 1 && msg.hasMedia) {
                
            }
        }
        else {
            client.sendMessage(msg.from, `Anda harus melengkapi data diri terlebih dahulu.\nSilahkan ketik datar untuk melengkapi data diri`);
        }
    } catch (err) {
        console.log(err)
        let user = await Models.User.findOne({
            where: {
                id: msg.from
            }
        });

        user.currentState.currentQuizCreate = '';
        client.sendMessage(msg.from, `Maaf terjadi kesalahan server`);
    }
});

client.on('message_create', (msg) => {
    // Fired on all message creations, including your own
    if (msg.fromMe) {
        // do stuff here
    }
});

client.on('message_revoke_everyone', async (after, before) => {
    // Fired whenever a message is deleted by anyone (including you)
    console.log(after); // message after it was deleted.
    if (before) {
        console.log(before); // message before it was deleted.
    }
});

client.on('message_revoke_me', async (msg) => {
    // Fired whenever a message is only deleted in your own view.
    console.log(msg); // message before it was deleted.
});

client.on('message_ack', (msg, ack) => {
    /*
        == ACK VALUES ==
        ACK_ERROR: -1
        ACK_PENDING: 0
        ACK_SERVER: 1
        ACK_DEVICE: 2
        ACK_READ: 3
        ACK_PLAYED: 4
    */

    if(ack == 3) {
        // The message was read
    }
});

client.on('group_join', (notification) => {
    // User has joined or been added to the group.
    console.log('join', notification);
    notification.reply('User joined.');
});

client.on('group_leave', (notification) => {
    // User has left or been kicked from the group.
    console.log('leave', notification);
    notification.reply('User left.');
});

client.on('group_update', (notification) => {
    // Group picture, subject or description has been updated.
    console.log('update', notification);
});

client.on('change_battery', (batteryInfo) => {
    // Battery percentage for attached device has changed
    const { battery, plugged } = batteryInfo;
    console.log(`Battery: ${battery}% - Charging? ${plugged}`);
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
});

client.initialize();