# wabotun

## Installation
```
Wabotun require :
- smartphone with Whatsapp ready to connect whatsapp web
- node.js 10.6
- postgres
- sequelize
- sequelize cli
```

```
Wabotun use whatsapp-web.js library for whatsapp api
```

to run this application follow this step :
1. Install sequelize and sequelize-cli as global installation ```npm install sequelize sequelize-cli -g```
2. setup your postgres credential in config/config.json
3. run this command below

```sh
$ git clone https://github.com/toriqahmads/wabotun.git
$ cd wabotun
$ npm install
$ sequelize db:create
$ sequelize db:migrate
$ node index.js
```

4. terminal will show qr code, scan qr-code to login whatsapp web
5. wait until client ready!
