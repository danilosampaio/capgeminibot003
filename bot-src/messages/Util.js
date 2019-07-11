const environment = "test";
const qualificationMode = (environment == "test" ? true : false); // producao = false 

module.exports.prepareRequest = (type, childbot, msg, language, userId, userName, contexto, lastPoll) => {

	let email = userId.replace('sip:', '');
	let matricula = email;
	let pos = email.indexOf('@');
	if (pos > -1) {
		matricula = email.substr(0, pos);
    }
    
	let requestData = {
		method: 'GET',
	  //uri: "https://sma-g2-adm.prosodie.com/servlet/talk",
	  uri: "https://sma-g7-adm.prosodie.com/servlet/talk",
		qs: {
			userInput: msg,
			botId: childbot,
			space: "VALE",
			language: language,
			format: "JSon",
			user_id: matricula,
			user_mail: email,
			user_name: userName,
			qualificationMode: qualificationMode
		}
	};	 

	if (type == "Assistant") {
		requestData.qs.context = contexto;
		requestData.qs.mode = "Synchron";
		requestData.qs.solutionUsed = "ASSISTANT";
	} else if (type == "Livechatpost") {
		requestData.qs.context = contexto;
		requestData.qs.mode = "Synchron";
		requestData.qs.solutionUsed = "LIVECHAT";
	} else if (type == "Livechat") {
		requestData = {
			method: "GET",
			//uri: "https://sma-g2-adm.prosodie.com/servlet/chatHttp",
			uri: "https://sma-g7-adm.prosodie.com/servlet/chatHttp",
			headers: {
				"content-type": "application/json",
			},
			json: {
				"type": "poll",
				"parameters": {
					"contextId": contexto,
					"userInput": msg,
					"mode": "Polling",
					"solutionUsed": "LIVECHAT",
					"timestamp": new Date().getTime() - 1000,
					"lastPoll": lastPoll,
					"botId": childbot,
					"space": "VALE",
					"language": language,
					"format": "JSon",
					"user_id": matricula,
					"user_mail": email,
					"user_name": userName,
					"qualificationMode": qualificationMode
				}
			}
		}
	} else if(type == "ListarChamados") {
		// requestData.uri = 'https://app1.mercury.doyoudreamup.com/servlet/talk';
		requestData.uri = 'https://sma-g7-adm.prosodie.com/servlet/talk';
		requestData.qs.space = 'Default';
		requestData.qs.context = contexto;
	}

	return requestData;
}

module.exports.botIds = {
	"uri1" : "3037ae57-a753-4c4a-aeac-d541aae89e31",
  	//"uri1" : "cb81e7a0-8782-485f-ad09-786dab4d9b6b",
	//"uri2" : "9c4a5690-f07e-4318-96b1-652a974e5fda"
	"uri2" : "3037ae57-a753-4c4a-aeac-d541aae89e31"
}

module.exports.statusToReplace = { 
	"In Progress": "Em andamento",
	"Initiated": "Iniciado",
	"Pending": "Pendente",
	"Planning": "Em planejamento",
	"Waiting for Approval": "Aguardando aprovação",
	"Solved": "Resolvido",
	"Closed": "Requisição encerrada",
	"Cancelled": "Cancelado",
	"Rejected": "Rejeitado",
	"Completed": "Resolvido",
	"WaitingApproval": "Aguardando aprovação",
	"I've found" : "Encontrei",
	"tickets in the last 2 months. To view all your tickets or tickets before 2 months, visit " : "chamados nos últimos 2 meses. Para consultar todos os seus chamados ou chamados anteriores a 2 meses, visite o ",
	"You can also search for any ticket by typing 'Searching ticket'" : "Você também pode consultar qualquer chamado digitando 'Consulta de chamado'",
	"The status of the ticket" : "O status do chamado",
	"Support for user who had a problem updating a software" : "Suporte para usuário que teve problema com a atualização de versão de um software",
	"created in" : "aberto em",
	" by " : " por ",
	"is in status": "encontra-se no status",
	"Opened by" : "Aberto por",
	" To: " : "Para: ",
	"Ticket's details":"Detalhes do chamado",
	" is:" : " é:",
	"The ticket REQ": "O chamado REQ",
	"was closed in" : "foi encerrado em",
	"with the following description" : "com a seguinte descrição",
	"If you want to redo the request, access the" : "Caso queira refazer a solicitação, acesse o",
	"and select the request you want to open" : "e selecione a solicitação que deseja abrir",
	"Type help to get more information about what I can do for you" : "Digite ajuda para obter mais informações sobre o que posso fazer",
	"Main cause": "Causa raiz",
	"Immediate action":"Ação imediata",
	"Corrective action" : "Ação corretiva",
	"Tests Performed" : "Testes Realizados",
	"Analyst" : "Nome do analista",
	"Remote support" : "Atendimento remoto",
	"Comments:" : "Comentários:"
};