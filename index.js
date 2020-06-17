const _ = require('lodash');
const Models = require('./models');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, MessageMedia } = require('whatsapp-web.js');
const csv = require("csvtojson");
const { Base64 } = require('js-base64');

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
                id: '',
                currentStep: '',
                nextCommand: '',
                currentQuestion: {},
                currentQuizCode: '',
                currentTimeUsed: 0,
                currentStartTime: '',
                answered: [],
                correct: 0,
                point: 0,
                currentQuizCreate: ''
            }
        });

        if (user.currentState.currentQuizCode != '') {
            const indexState = _.findIndex(user.userState, { quizCode: user.currentState.currentQuizCode });
            if (indexState > -1) {
                user.userState = user.userState[indexState];
            }
        }

        if (message.toLowerCase().trim() == 'ping') {
            msg.reply('pong');
        }

        else if (message.toLowerCase().trim() == 'help') {
            client.sendMessage(msg.from, `*daftar* : untuk mendaftar dan melengkapi data diri
*mulai ujian* : untuk memulai ujian
*buat ujian* : untuk membuat ujian baru
*a|b|c|d|e* : untuk menjawab soal
*no [no soal]* : untuk loncat ke soal no [no soal]
*selanjutnya* : untuk loncat ke soal no selanjutnya
*sebelumnya* : untuk loncat ke soal no sebelumnya`)
        }

        else if ((message.toLowerCase().trim() == 'daftar' 
            ||
            message.match(/^[a-zA-Z\s]{1,25}$/i)
            ||
            message.match(/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/i)
           ) 
        && 
            (user.firstName == null || user.lastName == null || user.email == null)
        && 
            (message.toLowerCase().trim() != 'buat ujian' && message.toLowerCase().trim() != 'sebelumnya' && message.toLowerCase().trim() != 'selanjutnya' && message.toLowerCase().trim() != 'help')
        ) {
            if (user.firstName == null && message.toLowerCase().trim() == 'daftar') {
                user.currentState.currentStep = 'daftar';
                user.currentState.nextCommand = 'Masukkan nama depan Anda (Maksimal 25 karakter termasuk spasi)';
                user.changed('currentState', true);
                await user.save();

                msg.reply(user.currentState.nextCommand);
            }
            else if (user.firstName == null && message.match(/^[a-zA-Z\s]{1,25}$/i) && user.currentState.currentStep == 'daftar') {
                user.currentState.currentStep = 'daftar';
                user.currentState.nextCommand = 'Masukkan nama belakang Anda (Maksimal 25 karakter termasuk spasi)';
                user.firstName = message;
                user.changed('currentState', true);
                await user.save();

                msg.reply(user.currentState.nextCommand);
            }
            else if (user.lastName == null && message.match(/^[a-zA-Z\s]{1,25}$/i) && user.currentState.currentStep == 'daftar') {
                user.currentState.currentStep = 'daftar';
                user.currentState.nextCommand = 'Masukkan email Anda';
                user.lastName = message;
                user.changed('currentState', true);
                await user.save();

                msg.reply(user.currentState.nextCommand);
            }
            else if (user.email == null 
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

        else if ((message.toLowerCase().trim() == 'mulai ujian' 
                || message.match(/^[a-zA-Z]{7,7}$/g))
            && (user.firstName && user.lastName && user.email)
        ) {
            if (message.match(/^[a-zA-Z]{7,7}$/) && user.currentState.currentStep == 'mulai ujian') {
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
                        user.currentState.id = haveQuizState.id;
                        user.currentState.currentStep = 'mulai ujian';
                        user.currentState.currentQuizCode = message;
                        user.currentState.currentQuiz = quiz.quizQuestions;
                        user.changed('currentState', true);
                        await user.save();
                        await updateState({
                            currentState: user.currentState,
                            from: msg.from,
                            quizCode: user.currentState.currentQuizCode
                        });
                    } 
                    else {
                        let quizs = quizParser({
                            question: quiz.quizQuestions[0].question,
                            options: quiz.quizQuestions[0].options
                        });

                        user.currentState.currentQuizCode = message;
                        user.currentState.currentStep = 'mulai ujian';
                        user.currentState.nextCommand = quizs;
                        user.currentState.currentQuiz = quiz.quizQuestions;
                        user.currentState.currentQuestion = { questionId: quiz.quizQuestions[0].id, index: 0 };
                        user.changed('currentState', true);
                        await user.save();
                        const state = await Models.State.create({
                            whatsapp: msg.from,
                            quizCode: message,
                            currentState: user.currentState
                        });

                        user.currentState.id = state.id;
                        user.changed('currentState', true);
                        await user.save();
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

        else if ((user.currentState 
            && 
            user.currentState.currentStep == 'mulai ujian'
            &&
            user.userState
            &&
            message.toLowerCase().trim().match(/^[a|b|c|d|e]{1,1}$/))
            && (user.firstName && user.lastName && user.email)
        ) {
            if(user.currentState.currentQuiz.length < 1) {
                client.sendMessage(
                    msg.from, 
                    `Anda belum memulai ujian, silahkan mulai ujian dengan perintah mulai ujian`
                );
            } else {
                const indexAnswered = _.findIndex(user.currentState.answered, { questionId: user.currentState.currentQuestion.questionId });
                
                if(indexAnswered == -1) {
                    if (user.currentState.currentQuiz[user.currentState.currentQuestion.index].correctAnswer.toLowerCase().trim() == message.toLowerCase().trim()) {
                        let newPoint = Number.parseInt(user.currentState.point) + Number.parseInt(user.currentState.currentQuiz[user.currentState.currentQuestion.index].correctPoint);
                        let newCorrect = Number.parseInt(user.currentState.correct) + 1;
                        user.currentState.point = newPoint;
                        user.currentState.correct = newCorrect;
                        user.changed('currentState', true);
                        await user.save();
                    } else {
                        let newPoint = Number.parseInt(user.currentState.point) - Number.parseInt(user.currentState.currentQuiz[user.currentState.currentQuestion.index].wrongPoint);
                        user.currentState.point = newPoint;
                        user.changed('currentState', true);
                        await user.save();
                    }
                    
                    user.currentState.answered.push({ answered: message.toLowerCase().trim(), questionId: user.currentState.currentQuestion.questionId }); 
                    user.changed('currentState', true);
                    await user.save();
                } else {
                    if (user.currentState.answered[indexAnswered].answered.toLowerCase().trim() != message.toLowerCase().trim()) {
                        if (user.currentState.currentQuiz[user.currentState.currentQuestion.index].correctAnswer.toLowerCase().trim() != user.currentState.answered[indexAnswered].answered.toLowerCase().trim()
                            &&
                            user.currentState.currentQuiz[user.currentState.currentQuestion.index].correctAnswer.toLowerCase().trim() == message.toLowerCase().trim()
                        ) {
                            let newPoint = Number.parseInt(user.currentState.point) + Number.parseInt(user.currentState.currentQuiz[user.currentState.currentQuestion.index].correctPoint);
                            newPoint = newPoint + (-1 * Number.parseInt(user.currentState.currentQuiz[user.currentState.currentQuestion.index].wrongPoint));
                            let newCorrect = Number.parseInt(user.currentState.correct) + 1;
                            user.currentState.correct = newCorrect;
                            user.currentState.point = newPoint;
                            user.changed('currentState', true);
                            await user.save();
                        }

                        if (user.currentState.currentQuiz[user.currentState.currentQuestion.index].correctAnswer.toLowerCase().trim() == user.currentState.answered[indexAnswered].answered.toLowerCase().trim()
                            && 
                            user.currentState.answered[indexAnswered].answered.toLowerCase().trim() != message.toLowerCase().trim()
                        ) {
                            let newPoint = Number.parseInt(user.currentState.point) - Number.parseInt(user.currentState.currentQuiz[user.currentState.currentQuestion.index].correctPoint);
                            newPoint = newPoint + Number.parseInt(user.currentState.currentQuiz[user.currentState.currentQuestion.index].wrongPoint);
                            let newCorrect = Number.parseInt(user.currentState.correct) - 1;
                            user.currentState.correct = newCorrect;
                            user.currentState.point = newPoint;
                            user.changed('currentState', true);
                            await user.save();
                        }

                        user.currentState.answered[indexAnswered].answered = message.toLowerCase().trim();
                        user.changed('currentState', true);
                        await user.save();
                    }
                }

                let idx = user.currentState.currentQuestion.index + 1;

                if ((idx) == (user.currentState.currentQuiz.length)) {
                    await updateState({
                        currentState: user.currentState,
                        result: {
                            correct: user.currentState.correct,
                            point: user.currentState.point
                        },
                        from: msg.from,
                        quizCode: user.currentState.currentQuizCode
                    });

                    client.sendMessage(
                        msg.from, 
                        `Anda telah menjawab semua soal, jika ingin mengoreksi jawaban silahkan ketik \`no [NOSOAL]\``
                    );
                } else {
                    let quiz = quizParser({
                        question: user.currentState.currentQuiz[idx].question,
                        options: user.currentState.currentQuiz[idx].options
                    });

                    user.currentState.nextCommand = quiz;
                    user.currentState.currentQuestion.questionId = user.currentState.currentQuiz[idx].id;
                    user.currentState.currentQuestion.index = idx;
                    user.changed('currentState', true);
                    await user.save();
                    await updateState({
                        currentState: user.currentState,
                        result: {
                            correct: user.currentState.correct,
                            point: user.currentState.point
                        },
                        from: msg.from,
                        quizCode: user.currentState.currentQuizCode
                    });

                    client.sendMessage(msg.from, user.currentState.nextCommand);
                }
            }
        }

        else if ((message.toLowerCase().trim().match(/^no\s+\d+$/i) && user.currentState.currentStep == 'mulai ujian')
            && (user.firstName && user.lastName && user.email)
        ) {
            const no = Number.parseInt(message.split(' ')[1]) - 1;
            if (typeof(user.currentState.currentQuiz[no]) == 'undefined') {
                client.sendMessage(
                    msg.from, 
                    `Nomor soal yang Anda masukkan tidak tersedia. No soal terakhir adalah ${user.currentState.currentQuiz.length}`
                );
            }
            else {
                let quiz = quizParser({
                    question: user.currentState.currentQuiz[no].question,
                    options: user.currentState.currentQuiz[no].options
                });

                user.currentState.currentQuestion.questionId = user.currentState.currentQuiz[no].id;
                user.currentState.currentQuestion.index = no;
                user.currentState.nextCommand = quiz;
                user.changed('currentState', true);
                await user.save();
                await updateState({
                    currentState: user.currentState,
                    result: {
                        correct: user.currentState.correct,
                        point: user.currentState.point
                    },
                    from: msg.from,
                    quizCode: user.currentState.currentQuizCode
                });

                client.sendMessage(msg.from, user.currentState.nextCommand);
            }
        }

        else if ((message.toLowerCase().trim() == 'selanjutnya' && user.currentState.currentStep == 'mulai ujian')
            && (user.firstName && user.lastName && user.email)
        ) {
            if ((user.currentState.currentQuestion.index + 1) > user.currentState.currentQuiz.length) {
                client.sendMessage(msg.from, `Anda sedang mengerjakan soal terakhir`);
            } else {
                let quiz = quizParser({
                    question: user.currentState.currentQuiz[user.currentState.currentQuestion.index + 1].question,
                    options: user.currentState.currentQuiz[user.currentState.currentQuestion.index + 1].options
                });
                user.currentState.nextCommand = quiz;
                user.currentState.currentQuestion.questionId = user.currentState.currentQuiz[user.currentState.currentQuestion.index + 1].id;
                user.currentState.currentQuestion.index = user.currentState.currentQuestion.index + 1;
                user.changed('currentState', true);
                await user.save();
                await updateState({
                    currentState: user.currentState,
                    result: {
                        correct: user.currentState.correct,
                        point: user.currentState.point
                    },
                    from: msg.from,
                    quizCode: user.currentState.currentQuizCode
                });

                client.sendMessage(msg.from, user.currentState.nextCommand);
            }
        }

        else if ((message.toLowerCase().trim() == 'sebelumnya' && user.currentState.currentStep == 'mulai ujian')
            && (user.firstName && user.lastName && user.email)
        ) {
            if ((user.currentState.currentQuestion.index - 1) < 0) {
                client.sendMessage(msg.from, `Anda sedang mengerjakan soal no pertama`);
            } else {
                let quiz = quizParser({
                    question: user.currentState.currentQuiz[user.currentState.currentQuestion.index - 1].question,
                    options: user.currentState.currentQuiz[user.currentState.currentQuestion.index - 1].options
                });

                user.currentState.nextCommand = quiz;
                user.currentState.currentQuestion.questionId = user.currentState.currentQuiz[user.currentState.currentQuestion.index - 1].id;
                user.currentState.currentQuestion.index = user.currentState.currentQuestion.index - 1;
                user.changed('currentState', true);
                await user.save();
                await updateState({
                    currentState: user.currentState,
                    result: {
                        correct: user.currentState.correct,
                        point: user.currentState.point
                    },
                    from: msg.from,
                    quizCode: user.currentState.currentQuizCode
                });
                 
                client.sendMessage(msg.from, user.currentState.nextCommand);
            }
        }

        else if ((message.toLowerCase().trim() == 'buat ujian'
                || message.match(/^([12]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))$/)
                || message.match(/^[\w\s]{10,50}$/)
                || message.match(/^[0-9]+$/)
                || msg.hasMedia)
            && (user.firstName && user.lastName && user.email)
        ) {
            let quizInfo
            if (user.currentState.currentQuizCreate != null) {
                quizInfo = await Models.QuizInfo.findOne({
                    where: {
                        id: user.currentState.currentQuizCreate
                    },
                    include: [{
                        model: Models.Quiz,
                        as: 'quizQuestions'
                    }]
                });

                if (quizInfo && msg.hasMedia == false) {
                    if (quizInfo.quizQuestions.length < 1 && (quizInfo.quizName && quizInfo.quizDate && quizInfo.quizTime)) {
                        user.currentState.currentStep = 'buat ujian';
                        user.currentState.nextCommand = `Silahkan mengisi soal sesuai dengan template berikut dan kirimkan kembali dalam format .csv`;
                        user.changed('currentState', true);
                        await user.save();

                        const templateQuiz64 = fs.readFileSync('templateQuiz.csv', 'base64');
                        const templateQuiz = new MessageMedia('text/csv', templateQuiz64, `templateQuiz`);
                        
                        client.sendMessage(msg.from, templateQuiz);
                    }
                }
            }
            
            if (message.toLowerCase().trim() == 'buat ujian' && !quizInfo) {
                if (user.currentState.currentQuizCreate == '') {
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

            else if (quizInfo.quizName == null && message.toLowerCase().trim() != 'buat ujian' && user.currentState.currentStep == 'buat ujian' && message.match(/^[\w\s]{10,50}$/)) {
                user.currentState.currentStep = 'buat ujian';
                user.currentState.nextCommand = `Masukkan tanggal ujian (YYYY-MM-DD)`;
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

            else if (quizInfo.quizDate == null && message.match(/^([12]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))$/) && user.currentState.currentStep == 'buat ujian') {
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

            else if (quizInfo.quizTime == null && message.match(/^[0-9]+$/) && user.currentState.currentStep == 'buat ujian' && msg.hasMedia == false) {
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

                const templateQuiz64 = fs.readFileSync('templateQuiz.csv', 'base64');
                const templateQuiz = new MessageMedia('text/csv', templateQuiz64, `templateQuiz`);

                msg.reply(user.currentState.nextCommand);
                setTimeout(function(){ 
                    client.sendMessage(msg.from, templateQuiz); 
                }, 1000);
            } 

            else if (msg.hasMedia && user.currentState.currentStep == 'buat ujian') {
                const quizQuestions = await msg.downloadMedia();

                const jsonArray = await csv().fromString(Base64.decode(quizQuestions.data));

                if (jsonArray) {
                    const quizzes = jsonArray.map((q) => {
                        return {
                            quizCode: user.currentState.currentQuizCreate,
                            question: q.question,
                            options: {
                                a: q.a,
                                b: q.b,
                                c: q.c,
                                d: q.d,
                                e: q.e
                            },
                            correctAnswer: q.correctAnswer,
                            correctPoint: q.correctPoint,
                            wrongPoint: q.wrongPoint
                        }
                    });

                    await Models.Quiz.bulkCreate(quizzes);

                    user.currentState.currentStep = '';
                    user.currentState.nextCommand = `Ujian berhasil dibuat. Kode ujian Anda adalah ${user.currentState.currentQuizCreate}.\nSilahkan berikan kode ujian kepada peserta ujian yang akan mengikuti ujian`;
                    user.changed('currentState', true);
                    await user.save();
                }
                
                client.sendMessage(msg.from, user.currentState.nextCommand);
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

let quizParser = (data) => {
    let message = `${data.question}\n`;
    _.forEach(data.options, (val, key) => {
        message += `\n${key.toUpperCase().trim()}. ${val.trim()}`
    });

    return message;
}

let updateState = async (data) => {
    try {
        let state = await Models.State.findOne({
            where: {
                whatsapp: data.from,
                quizCode: data.quizCode
            }
        });

        if (data.currentState) {
            state.currentState = data.currentState;
            state.changed('currentState', true);
        }
        if (data.result) {
            state.result = data.result;
            state.changed('result', true);
        }

        await state.save();

        return Promise.resolve()
    }
    catch(err) {
        return Promise.reject(err);
    }
}