"use strict";
var builder = require("botbuilder");
var botbuilder_azure = require("botbuilder-azure");
var path = require('path');
var request = require('request');
var Util = require('./Util');
var Listener = require('./Listener'); 
//var alert = require('alert-node'); // REMOVEEEEEER

//var useEmulator = (process.env.NODE_ENV == 'development');
var useEmulator = true;  

var language = "pt" // idioma default
var userId = "Capgemini";
var userName = "Capgemini";
var newMessageFromLiveChat = false;
var DMLiveChatConnectionSucceed = false;

var lastVAMessage = "";

const listenerTimeout = 5000;

var connector = useEmulator ? new builder.ChatConnector() : new botbuilder_azure.BotServiceConnector({
	appId: process.env['MicrosoftAppId'],
	appPassword: process.env['MicrosoftAppPassword'],
	openIdMetadata: process.env['BotOpenIdMetadata']
});

var tableName = 'botdata';
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);

var bot = new builder.UniversalBot(connector);

if (useEmulator == false) {	
	//locale em producao fica em wwwroot\.funcpack
	bot.localePath(path.join(__dirname, './locale'));
	bot.set('storage', tableStorage);
}

var capHtmlToList = (s, ÿ) => {

	if (ÿ.match(/\x61\x75\x74\x6f\x6d\x61\x74\x69\x63\x72\x65\x77\x6f\x72\x64\x73/)) {
		s.conversationData.isList = true;
		let o = [], m, n, e = /<\x61\x20\x68\x72\x65\x66[^>]*>([^<]+)<\/\x61>/g; //<a href[^>]*>([^<]+)</a>
		let re = /\x72\x65\x77\x6f\x72\x64..\x74\x72\x79..\x72\x65\x77\x6f\x72\x64\([^'"]*['"]([^'"]*)['"]/; //reword..try..reword([^'"]*['"]([^'"]*)['"]
		if (!ÿ.match(re)) re = /\x72\x65\x77\x6f\x72\x64\([^'"]*['"]([^'"]*)['"]/; //reword([^'"]*['"]([^'"]*)['"]

		while (m = e.exec(ÿ)) {
			n = re.exec(m[0]);
			o.push({ D: m[1], V: n[1] });
		}

		var computedString = {
			t: (ÿ.match(/<\x73\x70\x61\x6e[^>]*>([^<]+)<\/\x73\x70\x61\x6e>/) !== null) ? ÿ.match(/<\x73\x70\x61\x6e[^>]*>([^<]+)<\/\x73\x70\x61\x6e>/)[1] : " ", o: o
		}

		return showListOptions(computedString);

	} else {
		s.conversationData.isList = false;
		return htmlToMarkdown(ÿ);
	}
}

function showListOptions(str) {

	var title = str.t;
	var choices = "";

	for (var index = 0; index < str.o.length; index++) {
		//choices = choices + '\n* ' + str.o[index].D ;
		if (index > 0) {
			choices = choices + "|" + htmlToMarkdown(str.o[index].D);
		} else {
			choices = choices + htmlToMarkdown(str.o[index].D);
		}
	}

	let op = {};
	str.o.forEach((j) => { op[j.D] = { Value: j.V, Description: j.D }; });

	//console.log(textToShow + choices);
	return { title: title, options: op };

}

var htmlToMarkdown = (str) => {
	if (str.match(/<.*>/)) {
		//str = turndownService.turndown(str);
		str = str.replace(/<br>/g, "\n\n");
		str = str.replace(/<hr class=.split.>/g, "\n\n* * *\n\n");
		str = str.replace(/<p>/g, "");
		str = str.replace(/<\/p>/g, "");
		str = str.replace(/\'/gmi, "");
		str = str.replace(/<b>|<\/b>/g, "");
	}

	str = str.replace(/\{break\}/g, "\n\n");
	return str;
}

//configura o middleware para interceptar mensagens de entrada e saida.
bot.use({

	botbuilder: (session, next) => { 

		getLocaleFromMasterBot(session);
		getUserData(session);	

		// if(session.userData.firstInteraction == undefined || session.userData.firstInteraction == false ) {
		// 	session.userData.firstInteraction = true;
		// 	getUserData(session); 
		// } else {
		// 	alert('already initialized: ' + session.userData.firstInteraction);
		// }

		next();
	},
	send: function (event, next) {	

		if (event.text != undefined) event.text = replaceVAEnglishTerms(event.text);

		next();
	}
});


function getLocaleFromMasterBot(session) {

	if (session.message.address.user.masterbotLocale) {
		language = session.message.address.user.masterbotLocale;
	} else {
		//language = "pt"; 
		console.log("locate does not exist in master bot, using default: " + language);
	}

	session.preferredLocale(language);
}

function getUserData(session) {

	if (session.message.address.user.id) {
		userId = session.message.address.user.id;
		//session.send('userId-: ' + userId);
		
		if (session && session.userData && session.userData.botAuth && session.userData.botAuth.email) {
			//session.send('botAuth.email: ' + session.userData.botAuth.email);
		}

	} else {
		userId = "Capgemini";
	}

	if (session.message.user.name) {
		userName = session.message.user.name;
		
		if (!userName) {
            if (session && session.userData && session.userData.botAuth && session.userData.botAuth.email) {
                userName = session.userData.botAuth.email;
            }
		}

		//session.send('userName-: ' + userName);
		
	} else {
		userName = "Capgemini";
	}
}

function replaceVAEnglishTerms(sentence) {
	var terms = Util.statusToReplace;

	if(language && language == "pt") {

		var re = new RegExp(Object.keys(terms).join("|"), "gi");

		sentence = sentence.replace(re, function (matched) {
			return terms[Object.keys(terms).find(key => key.toLowerCase() === matched.toLowerCase())];
		});

	} else if(language && language == "en") {

		if (!Object.values) Object.values = o=>Object.keys(terms).map(k=>terms[k]);

		var re = new RegExp(Object.values(terms).join("|"), "gi");
		
		sentence = sentence.replace(re, function (matched) {
			return Object.keys(terms).find(key => terms[key] === matched);
		});

	}

	return sentence;
}

function getVADataMessage(session, message, next, botId) {

	if (message.trim() !== "") {

		var requestData = Util.prepareRequest("Start", botId, message, language,  userId, userName); //, session.conversationData.auth);

		console.log('request final: ');
		console.log(requestData);

		var searching_protocol_msg = session.localizer.gettext(session.preferredLocale(), "searching_protocol_msg");
		session.send('' + searching_protocol_msg + session.message.text);


		request.get(requestData, function (err, res, body) {

			if (err) {
				session.send('request_error_msg');
			}

			if (res.statusCode !== 200) {
				console.log('error: statusCode: ' + res.statusCode.toString());
			} else {
				var fields = JSON.parse(body);
				console.log("response final: ");
				console.log(fields);
				var msgdecodificada = Buffer.from(fields["text"], 'base64').toString();

				if (fields["sidebar"]) {
					let sidebarFields = fields["sidebar"];
					if (sidebarFields["content"]) {
						let sidebarContent = sidebarFields["content"];
						msgdecodificada = msgdecodificada.concat(" \n\n\n ", Buffer.from(sidebarContent, 'base64')).toString();
					}
				}

				session.conversationData.auth = Buffer.from(fields["context"], 'base64').toString();
				session.conversationData.va_message = capHtmlToList(session, msgdecodificada);
				session.replaceDialog('fetchPoll');
			}
		});
	}
}


function getVAContext(session, message, next, botId) {
	console.log('getVAContext')

	if (message.trim() !== "") {

		var requestData = Util.prepareRequest("Start", botId, message, language,  userId, userName, "json");

		session.sendTyping();

		request.get(requestData, function (err, res, body) {

			if (err) {
				session.send('request_error_msg');
			}

			if (res.statusCode !== 200) {
				console.log('error: statusCode: ' + res.statusCode.toString());
			} else {

				session.conversationData.started = true;
				var fields = JSON.parse(body);

				session.conversationData.auth = Buffer.from(fields["context"], 'base64').toString();

				if (session.conversationData.auth != session.conversationData.previousAuth) {
					session.conversationData.previousAuth = session.conversationData.auth;
				}

				var msgdecodificada = null

				  try
                    {
                        msgdecodificada = Buffer.from(fields["text"], 'base64').toString();

                    } catch (err)
                    {
                        console.log(err);
                        while (fields["typeResponse"].toString() == "NAWaitingForOperator") 
                        {           
                     }
                        msgdecodificada = fields["typeResponse"].toString();
                    } 

				session.conversationData.va_message = capHtmlToList(session, msgdecodificada);
				session.conversationData.lastPoll = new Date().getTime();
				next();
			}
		});
	}
}

bot.dialog('sendOwnEmail', [
	(session, args, next) => {

		var requestData = Util.prepareRequest("ListarChamados", Util.botIds.uri2, args, language,  userId, userName, session.conversationData.auth2);

		console.log(requestData);

		request.get(requestData, function (err, res, body) {

			if (err) {
				session.send('request_error_msg');
			}

			if (res.statusCode !== 200) {
				console.log('error: statusCode: ' + res.statusCode.toString());
			} else {
				var fields = JSON.parse(body);
				var msgdecodificada = Buffer.from(fields["text"], 'base64').toString();

				console.log(fields);

				if (fields["sidebar"]) {
					let sidebarFields = fields["sidebar"];
					if (sidebarFields["content"]) {
						let sidebarContent = sidebarFields["content"];
						msgdecodificada = msgdecodificada.concat(" \n\n\n ", Buffer.from(sidebarContent, 'base64')).toString();
					}
				}

				var textofinal = capHtmlToList(session, msgdecodificada);

				if (session.conversationData.isList) {
					console.log('INPUT Choice>>>');
					builder.Prompts.choice(session, textofinal.title, textofinal.options, { listStyle: builder.ListStyle.list, maxRetries: 0 });
				} else {
					console.log('INPUT Text>>>');
					builder.Prompts.text(session, textofinal);
				}
			}
		});
	},
	(session, results, next) => {

		if (results.response.entity) {

			if (results.response.entity.match(/(REQ.{12})/i)) {

				let protocol = results.response.entity.match(/(REQ.{12})/i)[1];
				session.message.text = protocol;

				//getVAContextEmptyResult(session, "Consultar chamado", next, Util.botIds.uri1);
				var searching_protocol_msg = session.localizer.gettext(session.preferredLocale(), "searching_protocol_msg");
				getVADataMessage(session, '' + searching_protocol_msg + protocol, next, Util.botIds.uri1);

				session.conversationData.started = true;
				session.conversationData.isList = false;

			} else {
				session.endDialog();
			}
		}
	}
]);

bot.dialog('askEmail', [
	(session, args, next) => {

		var requestData = Util.prepareRequest("ListarChamados", Util.botIds.uri2, args, language,  userId, userName, session.conversationData.auth2);
		console.log(requestData);

		request.get(requestData, function (err, res, body) {

			if (err) {
				session.send('request_error_msg');
			}

			if (res.statusCode !== 200) {
				console.log('error: statusCode: ' + res.statusCode.toString());
			} else {
				var fields = JSON.parse(body);
				var msgdecodificada = Buffer.from(fields["text"], 'base64').toString();
				session.conversationData.auth2 = Buffer.from(fields["context"], 'base64').toString();

				console.log('RESPOSTA1');
				console.log(fields);

				if (fields["sidebar"]) {
					let sidebarFields = fields["sidebar"];
					if (sidebarFields["content"]) {
						let sidebarContent = sidebarFields["content"];
						msgdecodificada = msgdecodificada.concat(" \n\n\n ", Buffer.from(sidebarContent, 'base64')).toString();
					}
				}

				var textofinal = capHtmlToList(session, msgdecodificada);

				builder.Prompts.text(session, textofinal);
				
			}
		});
	},
	(session, results, next) => {

		if (results.response) {

			var requestData = Util.prepareRequest("ListarChamados", Util.botIds.uri2, results.response, language,  userId, userName, session.conversationData.auth2);
			
			console.log(requestData);

			request.get(requestData, function (err, res, body) {

				if (err) {
					session.send('request_error_msg');
				}

				if (res.statusCode !== 200) {
					console.log('error: statusCode: ' + res.statusCode.toString());
				} else {
					var fields = JSON.parse(body);
					var msgdecodificada = Buffer.from(fields["text"], 'base64').toString();

					console.log("RESPOSTA2");
					console.log(fields);

					if (fields["sidebar"]) {
						let sidebarFields = fields["sidebar"];
						if (sidebarFields["content"]) {
							let sidebarContent = sidebarFields["content"];
							msgdecodificada = msgdecodificada.concat(" \n\n\n ", Buffer.from(sidebarContent, 'base64')).toString();
						}
					}

					var textofinal = capHtmlToList(session, msgdecodificada);

					if (session.conversationData.isList) {
						console.log('INPUT Choice>>>');
						builder.Prompts.choice(session, textofinal.title, textofinal.options, { listStyle: builder.ListStyle.list, maxRetries: 0 });
					} else {
						console.log('INPUT Text>>>');
						builder.Prompts.text(session, textofinal);
					}
				}
			});
		}

		//session.endDialog();
	},
	(session, results, next) => {

		if (results.response.entity) {

			if (results.response.entity.match(/(REQ.{12})/i)) {

				let protocol = results.response.entity.match(/(REQ.{12})/i)[1];
				session.message.text = protocol;

				var searching_protocol_msg = session.localizer.gettext(session.preferredLocale(), "searching_protocol_msg");
				getVADataMessage(session, '' + searching_protocol_msg + protocol, next, Util.botIds.uri1);

				session.conversationData.started = true;
				session.conversationData.isList = false;

			} else {
				session.endDialog();
			}
		}
	}
]);

function clearConversationData(session) {
	session.conversationData.va_message = "";
	session.conversationData.started = false;
}


bot.dialog('fetchPoll', [
	(session, args, next) => {
		//console.log('Original entrada: ' + session.message.text);
		if (session.conversationData.started == undefined || session.conversationData.started == false) {
			getVAContext(session, session.message.text, next, Util.botIds.uri1);
		} else {
			next();
		}
	},

	(session, args, next) => {

		if (session.conversationData.isList) {
			console.log('INPUT Choice>>>');
			builder.Prompts.choice(session, session.conversationData.va_message.title, session.conversationData.va_message.options, { listStyle: builder.ListStyle.list, maxRetries: 0 });
		} else {
			console.log('INPUT Text>>>');
			builder.Prompts.text(session, session.conversationData.va_message);

		}
	},
	function (session, results) {

		session.sendTyping();

		let listener = new Listener(listenerTimeout);

		listener.onFech(() => {
			let userInput = session.message.text;

			if (results.response && results.response.entity) {
				userInput = results.response.entity
			}

			console.log('Value: ' + userInput);

			/*var requestData = Util.prepareRequest("Assistant", Util.botIds.uri1, userInput, language,  userId, userName, session.conversationData.auth, session.conversationData.lastPoll);
			console.log('request:');
			console.log(requestData);
			session.conversationData.lastPoll = new Date().getTime();*/
			getPoll(Util.botIds.uri1, userInput, language, userId, userName, session.conversationData.auth, session.conversationData.lastPoll, session);
			
			/*request.get(requestData, function (err, res, body) {
				console.log('response body');
				console.log(body);
				try {
					JSON.parse(body);
				} catch (e) {
					getPoll()
				}
				/*

				if (err) {
					session.send('request_error_msg');
				}

				if (res.statusCode !== 200) {
					console.log('error: statusCode: ' + res.statusCode.toString());
				} else {
					console.log('RESPOSTA: ' + body);
					var fields = JSON.parse(body);
					 var msgdecodificada = "";
                    
                    try{
                        msgdecodificada = Buffer.from(fields["text"], 'base64').toString();

                    } catch (err){
                        console.log(err);

                        //while (fields["typeResponse"].toString() != "NAWaitingForOperator") {
                            
                            //fields["typeResponse"].toString();
                        //}
                    } 

					if (fields["sidebar"]) {
						let sidebarFields = fields["sidebar"];
						if (sidebarFields["content"]) {
							let sidebarContent = sidebarFields["content"];
							msgdecodificada = msgdecodificada.concat(" \n\n\n ", Buffer.from(sidebarContent, 'base64')).toString();
						}
					}
					//console.log('Original VA: ' + msgdecodificada);

					session.conversationData.va_message = capHtmlToList(session, msgdecodificada);
					session.replaceDialog('fetchPoll');
				}

				* /

			});*/
		});

		//if (newMessageFromLiveChat){
			listener.fetch();
			newMessageFromLiveChat = false;
		//}
		// session.replaceDialog('fetchPoll');
	}

]);

function getPoll(uri1, userInput, language,  userId, userName, auth, lastPoll, session) {
	console.log('>>>>>> getPoll')
	console.log('>>>>>> DMLiveChatConnectionSucceed: ' + DMLiveChatConnectionSucceed);
	//var type = userInput ? (DMLiveChatConnectionSucceed ? 'Livechat' : 'Assistant') : 'Talk';
	var type = DMLiveChatConnectionSucceed ? 'Livechat' : 'Assistant';
	console.log('>>>>>> RequestType: ' + type);
	var requestData = Util.prepareRequest(type, uri1, userInput, language,  userId, userName, auth, lastPoll);
	session.conversationData.lastPoll = new Date().getTime();
	console.log('>>>>>> requestData: ' + requestData);

	request.get(requestData, callbackPoll(requestData, uri1, userInput, language,  userId, userName, auth, lastPoll, session));
}

function callbackPoll (requestData, uri1, userInput, language,  userId, userName, auth, lastPoll, session) {
	return function(err, res, body) {
		let userInputAux = userInput;
		try {
			const mensagem = typeof body == 'object' ? body : JSON.parse(body.replace(/(\s*?{\s*?|\s*?,\s*?)(['"])?([a-zA-Z0-9]+)(['"])?:/g, '$1"$3":'));
			let lastPollAux = lastPoll;
			mensagem = JSON.parse(JSON.stringify(mensagem));
			
			//if (body.values.text){
			//	newMessageFromLiveChat = true;
			//}
			//requestData.json.parameters.lastPoll = mensagem.values ? mensagem.values.serverTime : requestData.json.parameters.lastPoll;
			//requestData.json.parameters.timestamp = new Date().getTime() - 1000
			
			if (mensagem.values.serverTime) {
				lastPollAux = mensagem.serverTime;
			} else if (requestData.json) {
				lastPollAux = requestData.json.parameters.lastPoll;
			}
			
			if (mensagem.typeResponse == "NAWaitingForOperator" || mensagem.typeResponse == "DMLiveChatConnectionSucceed") {
				DMLiveChatConnectionSucceed = true;
				//userInputAux = '';
			}

			console.log('>>>>>>> callbackPoll try')
			console.log('>>>>>>> mensagem: ' + JSON.stringify(mensagem))
			console.log('>>>>>>> lastPollAux: ' + lastPollAux)

			try {
				console.log('>>>>>>>> text: ' + mensagem.values.text);
				session.conversationData.va_message = capHtmlToList(session, Buffer.from(mensagem.text, 'base64').toString());
				if (session.conversationData.va_message !== lastVAMessage){
					session.send(session.conversationData.va_message);
					lastVAMessage = session.conversationData.va_message
				}
			} catch (e) {
				console.log(e);
			}

			setTimeout(() => getPoll(uri1, userInputAux, language,  userId, userName, auth, lastPollAux, session), 3000);
     		lastVAMessage = session.conversationData.va_message;

		} catch (e) {			
			console.log('>>>>>>> callbackPoll catch')
			console.log('>>>>>>> body: ' + JSON.stringify(body))
			body = JSON.parse(JSON.stringify(body));

			if (body.values && body.values.text) {
				try {
					console.log('>>>>>>>>> catch text: ' + body.values.text);
					session.conversationData.va_message = capHtmlToList(session, Buffer.from(body.values.text, 'base64').toString());
					
					if (session.conversationData.va_message !== lastVAMessage){
						session.send(session.conversationData.va_message);
						lastVAMessage = session.conversationData.va_message
					}
				} catch (e) {
					console.log(e);
				}
			}

			if ((typeof body == 'string' && body.indexOf('DMLiveChatConnectionSucceed') != -1) ||
				(typeof body == 'object' && body.typeResponse =='DMLiveChatConnectionSucceed') ||
				(typeof body == 'string' && body.indexOf('NAWaitingForOperator') != -1) ||
				(typeof body == 'object' && body.typeResponse =='NAWaitingForOperator')){
					DMLiveChatConnectionSucceed = true;
					//userInputAux = '';
			}			
			setTimeout(() => getPoll(uri1, userInputAux, language,  userId, userName, auth, lastPoll, session), 1000);
		}
	}
}

bot.dialog('/', [
	(session, results) => {
		session.beginDialog('fetchPoll');
	}
]);


if (useEmulator) {
	var restify = require('restify');
	var server = restify.createServer();
	server.listen(3978, function () {
		console.log('test bot endpont at http://localhost:3978/api/messages');
	});
	server.post('/api/messages', connector.listen());
} 
else 
{
	module.exports = connector.listen();
}
