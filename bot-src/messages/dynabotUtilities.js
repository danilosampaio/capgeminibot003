/* 
 * DynaBot - A ChatBot Framework
 * 
 * Copyright (C) Vale - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * 
 * Written by Marcel Stein <marcel@rstein.org>, August, 2017
 * complemented/altered by Rafael Bissoli November, 2018
 * 
 * DynaBot can not be copied and/or distributed without the express
 * permission of Marcel Stein <marcel@rstein.org>
 * 
 */

 //ajust delay as required
const defaultDelay = 2000;

exports.menuYesOrNo = (session) => {
    let yesStr = session.getFromCatalog("dbot:menu:yes");
    let noStr = session.getFromCatalog("dbot:menu:no");
    let menu = {};
    menu[yesStr] = {"Description": yesStr, "Value": yesStr.substr(0,1)};
    menu[noStr] = {"Description": noStr, "Value": noStr.substr(0,1)};
    return menu;
}

exports.dynabotSyntaxConverter = (s, t) => {
    console.log("t: " + t);
    let o=[],b=[],m,e=/{[^}]*?}/g;
    while(m=e.exec(t)) (m[0].substr(1,5)==="break")?b.push(m[0]):o.push(m[0]);
    while(m=o.pop()) {
        let r=m=m.substr(1,m.length-2),c=m.split(":");
        console.log("Command: ",m);
        switch(c[0]) {
            case "username":
                r=(s&&s.message&&s.message.address&&s.message.address.user&&s.message.address.user.name)?" "+s.message.address.user.name:"";
            break;
        }
        if (r!==m) t=t.split("{"+m+"}").join(r);
    }
    var r = [],i,c,d=null;
    //console.log("b:",b);
    //console.log("Original: ",t);
    while ((c=b.shift()) && (i=t.indexOf(c))) {
        let a=t.substr(0,i);
        r.push({t:a,d:d});
        d=c.substr(1,c.length-2).split(":")[1];
        t=t.substr(c.length+a.length);
        //console.log(a+"|"+c+"|"+t);
    }
    r.push({t:t,d:d});
    //console.log(">> r",r);
    return r;
}

//console.log(exports.dynabotSyntaxConverter(null,"aaa {username} bbb {break:2} ccc {break:1} ddd {break} eee {username:1} fff {break:2} ggg"));
//console.log(exports.dynabotSyntaxConverter(null,"aaa {username} bbb"));

var sendQueue = {};
var getConvId = (s)=>{
    //return s.conversationData._conversationId;
    return s.message.address.conversation.id
}

exports.overrideSessionFunctions = (dynabotHandler, session) => {
    session.logSystem = (msg) => {dynabotHandler.logSystem(msg);}
    //session.getFromCatalog = (phraseId, arr)=>{ return dynabotHandler.catalog.fromCatalogSession(session, phraseId, arr); };

    session.dynabotWaitQueue = () => {
        let __id = getConvId(session);
        let p = new Promise((resolve, reject)=>{
            let cc = 0, ds = "wait "+(new Date().getTime());
            var interval = setInterval( ()=>{
                //console.log(cc,ds,JSON.stringify(sendQueue[__id]));
                //console.log(sendQueue[__id]);
                if (!sendQueue[__id]) {
                    //console.log(">>>>>>>>>>>> acabou a fila...");
                    clearTimeout(interval);
                    //setTimeout(()=>{},000);
                    resolve();
                } else if (cc++>30) {
                    clearTimeout(interval);
                    reject(new Error("Conversation object was changed"));
                }
            }, 1000);
        }).catch(error => { console.log('Error caught:', error); });
        return p;
    }
    session.dynabotSendQueue = () => {
        let cc = 0, ds = "wait "+(new Date().getTime());
        let __id = getConvId(session);
        //if (session.conversationData && session.conversationData.sendQueue && session.conversationData.sendQueue.length>0) {
        if (sendQueue[__id] && sendQueue[__id].length>0) {
            //let ss = session.conversationData.sendQueue.shift();
            let ss=sendQueue[__id].shift();
            //console.log("sending ss:",ss);
            session.sendTyping();
            setTimeout(()=>{
                //console.log("dynabotSendQueue: "+ss.t);
                session.send(ss.t); 
                if ((sendQueue[__id]) && (sendQueue[__id].length===0)) sendQueue[__id] = null;
                if ((sendQueue[__id]) /*&& (session.conversationData.sendQueue.length>0)*/) { session.dynabotSendQueue(); }
            }, ss.d);
        }
    }
    session.dynabotSyntax = (txt) => {
        let syn = exports.dynabotSyntaxConverter(session, txt), res=[];
        syn.forEach( (n)=>{res.push(n.t);});
        //console.log("<<dynabotSyntax>>", res);
        return res.join("\n\n");
    }
    session.dynabotSend = (txt) => {
        let __id = getConvId(session);
        console.log('aqui ' + __id);
        // if user send a message when the queue have data, ignore
        if (!sendQueue[__id] || sendQueue[__id].length === 0 ) {
            //console.log("<<dynaSend>>",txt);
            let queueActive = true;
            console.log('txt: ' + txt);
            let syn = exports.dynabotSyntaxConverter(session, txt);
            //console.log(">> syn",syn);
            console.log('aqui 2 ' + syn.length);
            sendQueue[__id] = [];
            queueActive = false;

            syn.forEach( (as)=>{
                as.d = Number(as.d);
                if (!as.d) as.d = defaultDelay;
                //console.log(as);
                sendQueue[__id].push(as);
            } );
            /*if (!queueActive) */session.dynabotSendQueue();
        }
    }
    session.sendWithDelay = (obj, delay)=>{
        session.dynabotSend(obj);
    }
    session.sendWithDelay_old = (obj, delay)=>{
        if (delay == null) { delay = dynabotHandler.defaultDelay; }
        let msg = "";

        if (typeof obj === "string") { obj = obj.split("{break}"); msg = obj[0]; obj.splice(0, 1);
        } else {
            if (obj && obj.length) { msg = obj[0]; obj.splice(0, 1); }
        }

        session.sendTyping();
        setTimeout(()=>{
            session.send(msg); 
            if ((obj) && (obj.length>0)) { session.sendWithDelay(obj, delay); }
        }, delay);
    }
    session.sendFromCatalog = (phraseId, arr)=>{
        let msg = dynabotHandler.catalog.fromCatalogSession(session, phraseId, arr);
        session.sendWithDelay(msg);
    }
}