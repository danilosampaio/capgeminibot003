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

/**
 * DMLiveChatConnectionSucceed: variável de controle que é atualizada quando o 
 * VA inicia um livechat depois de receber algumas mensagems 'não conhecidas' pelo bot.
 * A partir desse momento, o usuário estará conversando com o operador.
 */
var DMLiveChatConnectionSucceed = false;

/**
 * DMLiveChatEnded: variável de controle que é atualizada quando o 
 * VA encerra o chat com o operador. A partir desse momento o usuário volta a falar com o bot.
 */
var DMLiveChatEnded = false;

/**
 * lastVAMessage: variável de controle que guarda a última mensagem recebida do VA.
 */
var lastVAMessage = "";

/**
 * lastSentMessage: variável de controle que guarda a última mensagem enviada para VA.
 */
var lastSentMessage = "";

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
				//session.replaceDialog('fetchPoll');
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

let forceFetchpoll = true;

bot.dialog('fetchPoll', [
	(session, args, next) => {
		/**
		 * Essa funcão atua de forma semelhante a um 'middleware' do express, onde é feito a verificação
		 * se já existe um 'context'. Se existir, chama o next(), que irá executar função seguinte
		 * que de fato trocar mensagens com o VA.
		 */
		console.log('>>>>>>>>>>>>>>>> emulador disparou a primeira função <<<<<<<<<<<<<<<')
		console.log('>>>>>>>>> context etapa 1: ' + session.conversationData.auth);
		
		/**
		 * Verifica se a conversa já foi iniciada e se já tem um context(session.conversationData.auth)
		 * antes de executar o 'getVAContext'
		 */
		if (!session.conversationData.started) {
			if (!session.conversationData.auth){
				getVAContext(session, session.message.text, next, Util.botIds.uri1);
			}
		} else {
			/**
			 * Se já existir o context, faz um bypass para a função seguinte.
			 */
			next();
		}
	},

	(session, results) => {
		/**
		 * Função que faz a troca de mensagens com o VA através do 'getPoll'.
		 */
		console.log('>>>>>>>>>>>>>>>> emulador disparou a segunda função <<<<<<<<<<<<<<<')
		console.log('>>>>>>>>> context etapa 2: ' + session.conversationData.auth);			
		console.log({results});
		
		if (session.conversationData.isList) {
			console.log('INPUT Choice>>>');
			builder.Prompts.choice(session, session.conversationData.va_message.title, session.conversationData.va_message.options, { listStyle: builder.ListStyle.list, maxRetries: 0 });
		} else {
			console.log('INPUT Text>>>');
			if (session.conversationData.va_message !== lastVAMessage){
				/**
				 * A linha abaixo foi comentada porque estava causando a exibição duplicada da mensagen
				 * 'desculpe, não entendi o que você disse. 'para o usuário (ou emulador)
				 */
				//builder.Prompts.text(session, session.conversationData.va_message);
			}
		}

		/**
		 * Se já tiver context, inicia a troca de mensagens.
		 */
		if (session.conversationData.auth){
			getPoll(Util.botIds.uri1, session.message.text, language, userId, userName, session.conversationData.auth, session.conversationData.lastPoll, session);
		}
	}
	/**
	 * A função abaixo foi comentada, pois o evento onFech estava com um comportamento estranho. 
	 * De forma intercalada, uma hora dispara a primeira e a segunda função definidas no
	 * 'bot.dialog('fetchPoll', [...', outra hora dispara apenas a terceira função, que é esta
	 * que está comentada. Isso estava causando o seguinte erro: apenas no segundo envio de mensagem
	 * que é getPoll era chamado, desta forma, a aplicação sempre estava uma mensagem atrasada.
	 * Mudamos a estratégia, ao invés desta terceira função, temos apenas duas: o middle para verificar
	 * se ja existe o context, e a função para executar o getPoll. Desta forma, resolvemos o atraso
	 * das mensagens. Mas ainda temos um problema que é contornável: o livechat que deveria iniciar
	 * apenas após a terceira mensagem desconhecida pelo bot, está sendo antecipada, ou seja, 
	 * a partir da segunda mensagem já está sendo iniciado o livechat.
	 */	
	/*,
	function (session, results) {
		console.log('>>>>>>>>>>>>>>>> emulador disparou a terceira função <<<<<<<<<<<<<<<')
		console.log('>>>>>>>>> context etapa 3: ' + session.conversationData.auth);	
		forceFetchpoll = true;

		session.sendTyping();

		let listener = new Listener(listenerTimeout);

		listener.onFech(() => {
			let userInput = session.message.text;

			if (results.response && results.response.entity) {
				//userInput = results.response.entity
			}

			console.log('Value: ' + userInput);

			/*var requestData = Util.prepareRequest("Assistant", Util.botIds.uri1, userInput, language,  userId, userName, session.conversationData.auth, session.conversationData.lastPoll);
			console.log('request:');
			console.log(requestData);
			session.conversationData.lastPoll = new Date().getTime();* /
			console.log('>>>>>>>>>> mensagem do emulador <<<<<<<<<<<');
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

			});* /
		});

		// session.replaceDialog('fetchPoll');
	}*/

]);

/**
 * getPoll: função que realiza a troca de mensagens com o VA.
 * 	- recebe as mensagens do usuário, e encaminha para o bot.
 *  - recebe as respostas do bot e retorna para o usuário
 *  - quando inciado um livechat, vai buscar as respostas no VA periodicamente (3sec)
 *  - caso o operador encerre a conversa, direciona novamente as mensagens do usuário para o bot
 * 
 * Parametros mais relevantes:
 * @param {*} userInput - esse parâmetro só vem preenhido quando o getPoll é chamado do onFetch. Quando é
 * 							chamado pelo timer que busca mensagens do VA periodicamente durante do livechat
 * 							esse parâmetro é null, pois o tipo da request é diferente.
 * @param {*} lastPoll - sempre que recebe uma nova mensagem do VA, o lastPoll é atualizado com base
 * 							no serverTime que vem no response. Isso é importante para que a proxima 
 * 							requisição pegue as respostas seguintes.
 * @param {*} internalPoll - parâmetro que define se a chamada veio do onFetch, ou pelas chamadas periódicas
 */
function getPoll(uri1, userInput, language,  userId, userName, auth, lastPoll, session, internalPoll) {
	console.log({DMLiveChatEnded, internalPoll})
	/**
	 * Verifica se o livechat no terminado pelo operador, e se o getPoll foi chamado do onFetch ou internamente.
	 * Caso o livechat tenha sido encerrado, só deve executar o getPoll se o usuário enviar uma nova 
	 * mensagem, para enviar que o loop que faz chamadas periódicas ao VA, continue fazendo requisições
	 * desnecessárias após o livechat tiver sido encerrado.
	 */
	if (DMLiveChatEnded && internalPoll) {
		return;
	}
	console.log({internalPoll, userInput, lastSentMessage})
	console.log('>>>>>> DMLiveChatConnectionSucceed: ' + DMLiveChatConnectionSucceed);
	console.log('>>>>>>>>> internalPoll: ' + internalPoll);
	/**
	 * Caso o livechat tenha sido iniciado, temos dois cenários:
	 * 	- chamado interna(internalPoll): então a request deve ter o tipo 'Livechat' para buscar respostas no VA
	 *  - chamado do onFetch: então a request deve ter o tipo null, para usar o payload padrão do 'Util.prepareRequest'
	 * Caso o livechat não tenha iniciado:
	 * 	- a request deve ter o tipo 'Assistant' que é uma mensagem para o bot.
	 */
	var type = DMLiveChatConnectionSucceed ? (internalPoll ? 'Livechat' : null) : 'Assistant';
	console.log({RequestType: type});
	var requestData = Util.prepareRequest(type, uri1, userInput, language,  userId, userName, auth, lastPoll);
	session.conversationData.lastPoll = new Date().getTime();
	console.log(type == 'Livechat' ? {requestData: requestData.json.parameters} : {requestData: requestData});

	/**
	 * Só executa a request se o livechat tiver iniciado, ou se é uma mensagem nova do usuário
	 */
	if (DMLiveChatConnectionSucceed || (internalPoll === undefined && userInput !== lastSentMessage)){
		request.get(requestData, callbackPoll(requestData, uri1, userInput, language,  userId, userName, auth, lastPoll, session, internalPoll));
	}
}

/**
 * Função que trata o retorno da request ao VA. Os parâmetros do 'getPoll' foram replicados aqui
 * para possibilitar a chamada recursiva do getPoll para buscar respostas periodicamente.
 */
function callbackPoll (requestData, uri1, userInput, language,  userId, userName, auth, lastPoll, session, internalPoll) {
	return function(err, res, body) {
		let lastPollAux = lastPoll;
		try {
			/**
			 * Se o getPoll foi chamado pelo onFetch, atualiza a última mensagem enviada.
			 */
			if (internalPoll === undefined){
				lastSentMessage = userInput;
			}

			/**
			 * A mensagem retornada pelo VA não é um JSON fora do padrão, onde as 'keys' não estão entre aspas
			 * duplas, e os 'values' também não estão entre aspas duplas. Por isso, é necessário o regex
			 * abaixo para padronizar a string que representa o JSON antes de fazer o parse.
			 */
			let mensagem = typeof body == 'object' ? body : JSON.parse(body.replace(/(\s*?{\s*?|\s*?,\s*?)(['"])?([a-zA-Z0-9]+)(['"])?:/g, '$1"$3":'));			
			
			/**
			 * Outra despadronização do JSON é que algumas aspas vem com escape(\\), dando erro ao
			 * fazer o parse. O stringify é feito aqui para resolver isso.
			 */
			mensagem = JSON.parse(JSON.stringify(mensagem));

			/**
			 * A estrutura do JSON varia de acordo com request, por isso o tratament abaixo.
			 */
			const typeResponse = mensagem.typeResponse || mensagem.type;
			const codeResponse = mensagem.code || (mensagem.values ? mensagem.values.code : '');
			
			/**
			 * Quando o operador encerra o chat, as variáveis abaixo precisam ser
			 * configuradas para que a aplicação derecione novamente o usuário para o bot.
			 */
			if (typeResponse == "notification" &&
				codeResponse == 'T25PcGVyYXRvckNsb3NlRGlhbG9n') {
				console.log('>>>>>>>>>>> a conversa acaba de ser fechada pelo operador.')
				DMLiveChatConnectionSucceed = false;
				DMLiveChatEnded = true;
				session.conversationData.started = false;
				session.conversationData.auth = null;
			}
			
			/**
			 * Atualiza o timestamp da request.
			 */
			if (requestData.json){
				requestData.json.parameters.timestamp = new Date().getTime() - 1000
			} else {
				requestData.timestamp = new Date().getTime() - 1000
			}
			
			/**
			 * Atualiza o lastPoll da request, para garantir que via pegar as próximas 
			 * respostas, caso contrário, sempre recebe a primeira resposta.
			 */
			if (mensagem.serverTime || (mensagem.values && mensagem.values.serverTime)) {
				lastPollAux = mensagem.serverTime || mensagem.values.serverTime;
			} else if (requestData.json) {
				lastPollAux = requestData.json.parameters.lastPoll;
			}
			
			/**
			 * Depois de algumas mensagens não reconhecidas pelo bot, o VA manda o comando
			 * abaixo para iniciar um livechat. A partir daqui as requests tem o tipo 'Livechat'.
			 */
			if (mensagem.typeResponse == "DMLiveChatConnectionSucceed" ||
				mensagem.typeResponse == "NAWaitingForOperator") {
				DMLiveChatConnectionSucceed = true;
				DMLiveChatEnded = false;
			}

			console.log('>>>>>>> callbackPoll try')
			console.log({mensagem: mensagem})
			console.log({lastPollAux: lastPollAux})

			try {
				/**
				 * A estrutura do JSON de reposta varia de acordo com a request, por isso o tratamento abaixo
				 */
				if (mensagem.text || (mensagem.values && mensagem.values.text)){
					/**
					 * Covernte o texto base63 para texto plano
					 */
					const texto = Buffer.from(mensagem.text || mensagem.values.text, 'base64').toString();
					console.log({text: texto});
					session.conversationData.va_message = capHtmlToList(session, texto);
					console.log({va_message: session.conversationData.va_message});
					/**
					 * Caso seja um mensagem nova, envia para o usuário.
					 */
					if (session.conversationData.va_message.length > 0 &&
						session.conversationData.va_message != lastVAMessage){
						session.send(session.conversationData.va_message);
						lastVAMessage = session.conversationData.va_message					
					}
				}
			} catch (e) {
				console.log(e);
			}

			/**
			 * So executa a request recursivamente se o livechat esteja ativo, em busca de novas respostas.
			 */
			if (DMLiveChatConnectionSucceed && !DMLiveChatEnded){
				//mensagem do emulador, usar talk, senão usar chatHttp
				setTimeout(() => getPoll(uri1, null, language,  userId, userName, auth, lastPollAux, session, true), 3000);
			}
		} catch (e) {
			/**
			 * Quase todo o código do try foi replicado no catch, para que o request 
			 * recursivo não parasse em caso de erros não tratados. Contudo, após algumas 
			 * tratamentos, não vemos mais a necessidade de manter o código abaixo após 
			 * realizarmos mais algums testes em ambiente de homologação.
			 */
			console.log(e);
			console.log('>>>>>>> callbackPoll catch');			
			body = JSON.parse(JSON.stringify(body));
			console.log({body: body})

			if (body.text || (body.values && body.values.text)) {
				try {
					if (body.serverTime || body.values.serverTime) {
						lastPollAux = body.serverTime || body.values.serverTime;
					} else if (requestData.json) {
						lastPollAux = requestData.json.parameters.lastPoll;
					}

					const texto = Buffer.from(body.text || body.values.text, 'base64').toString();
					console.log({catch_text: texto});
					session.conversationData.va_message = capHtmlToList(session, texto);
					
					if (session.conversationData.va_message.length > 0 &&
						session.conversationData.va_message != lastVAMessage){
						session.send(session.conversationData.va_message);
						lastVAMessage = session.conversationData.va_message
						//session.replaceDialog('fetchPoll');
					}
				} catch (e) {
					console.log(e);
				}
			}

			if ((typeof body == 'string' && body.indexOf('DMLiveChatConnectionSucceed') != -1) ||
				(typeof body == 'object' && body.typeResponse =='DMLiveChatConnectionSucceed')){
					DMLiveChatConnectionSucceed = true;
			}			

			if (DMLiveChatConnectionSucceed && !DMLiveChatEnded){
				setTimeout(() => getPoll(uri1, null, language,  userId, userName, auth, lastPollAux, session, true), 3000);
			}
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
