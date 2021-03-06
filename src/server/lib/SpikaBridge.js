var mongoose = require('mongoose');
var _ = require('lodash');
var spika = require('../../../modules_customised/spika');

var Const = require('./consts.js');
var Conf = require('./init.js');

var PushNotificationManager = require('./pushnotification/PushNotificationManager');
var SocketAPIHandler = require('../SocketAPI/SocketAPIHandler');

var UserModel = require('../Models/User');
var ConversationModel = require('../Models/Conversation');
var UnreadMessageModel = require('../Models/UnreadMessage');

var SpikaBridge = {
    
    SpikaServer: null,
    init:function(app,io,customConfig){
        
        var self = this;
        
        if(customConfig)
            Conf = customConfig;
            
        this.SpikaServer = new spika(app,io,{
        
            config:{
                chatDatabaseUrl : Conf.databaseUrl,
                port: Conf.port,
                uploadDir: Conf.uploadPath,
                imageDownloadURL: "/spika/media/images/",
                noavatarImg: "/spika/img/noavatar.png",
                urlPrefix: '/spika',
                sendAttendanceMessage: false
            },
            listeners:{
        
                onNewMessage:function(obj){
        
                    self.onNewMessage(obj);
                    
                },
                onNewUser:function(obj){
        
                    self.OnUserEnterChat(obj);
                    
                },
                OnUserTyping:function(obj){
        
        
                },
                OnMessageChanges:function(obj){
        
        
                }
        
            },
            hooks : {
                
                sendMessage : function(param,callBack){
                    
                    var result = {};
                    var fromUserID = param.userID;
                    var conversationID = param.roomID;
                    
                    result.canSend = true;

                    self.checkPermission(fromUserID,conversationID,function(hasPermission){
                        
                        if(hasPermission){
                            result.canSend = true;
                        }
                        
                        callBack(result);
                        
                    });

                },
                typing : function(param,callBack){
                    
                    var result = {};
                    var fromUserID = param.userID;
                    var conversationID = param.roomID;
                    
                    result.canSend = false;

                    self.checkPermission(fromUserID,conversationID,function(hasPermission){
                        
                        if(hasPermission){
                            result.canSend = true;
                        }
                        
                        callBack(result);
                        
                    });

                }

                
            }

        
        });
                
    },
    onNewMessage : function(obj){
        
        
        var message = {
            _id: obj._id,
            userID: obj.userID,
            roomID: obj.roomID,
            conversationID: obj.roomID,
            message: obj.message,
            type: obj.type,
            created: obj.created
        }
        
        ConversationModel.updateLastMessage(obj.roomID,message);
        
        // update unread count
        // get users who are in the chat
        var usersInRoom = this.SpikaServer.getOnlineUsersByRoomId(obj.roomID);
        var userIdsInRoom = [];
        _.forEach(usersInRoom,function(row){
            userIdsInRoom.push(row.userID);
        });
                
        UnreadMessageModel.newMessageToCounversation(userIdsInRoom,obj.roomID,function(){

            // notify online users
            ConversationModel.get().findOne({_id:obj.roomID},function(err,result){
                
                if(err)
                    return;
                    
                if(!result)
                    return;
                            
                _.forEach(result.users,function(userId){
                                    
                    SocketAPIHandler.emitToUser(
                        userId,
                        Const.emitCommandNewMessage,
                        {message:message}
                    );
                    
                });
                
            });
            
            PushNotificationManager.onNewMessage(obj);
            
        });
    
    },
    OnUserEnterChat: function(obj){
        
        UnreadMessageModel.clearCountByuserIdConversationId(obj.userID,obj.roomID);
        
    },
    sendNewMessage: function(user,conversationId,text,callBack){
        
        var self = this;
                
        var avatar = "";
        if(user.avatar)
            avatar = user.avatar.thumb;
            
        this.SpikaServer.loginToSpika({
            userID: user._id,
            roomID: conversationId,
            avatarURL: avatar,
            name: user.displayName
        },conversationId,function(resultLogin){
            
            if(resultLogin){

            	var sendMessageParams = {
                    roomID : conversationId,
                    userID : user._id,
                    type : 1,
                    message : text
            	};
        	                
                self.SpikaServer.sendMessage(user._id,sendMessageParams,function(resultSendMessage){
                                        
                    if(callBack) callBack({
                        message: resultSendMessage
                    });
                    
                })

            } else {
                
                if(callBack) callBack({
                });
                
            }   
                
        });
                        
    },
    
    checkPermission : function(userID,conversationID,callBack){
                    
        // check the sender is in the conversation
        var conversationModel = ConversationModel.get();

        // telNumber to userid
        var userModel = UserModel.get();
        
        userModel.findOne({telNumber:userID},function(err,userFindResult){

            if(err){
                callBack(false);
                return;
            }
                
            if(userFindResult)
                userID = userFindResult._id;
            
            conversationModel.find({users:{$in:[userID]},_id:conversationID},function(err,conversationFindResult){
                
                if(err){
                    callBack(false);
                    return;
                }
                
                if(conversationFindResult.length > 0)
                    callBack(true);
                else
                    callBack(false);
                 
            });
        
        });
                    
        
    }

}

module["exports"] = SpikaBridge;
