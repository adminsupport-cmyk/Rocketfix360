'use strict';
// Explicit user authorization and audited legacy destinations are prerequisites
// for changing this policy. Environment variables and callables cannot enable it.
module.exports=Object.freeze({
 externalSendingAuthorized:false,
 automaticDeliveryActivatedAt:null,
 allowedTestEmails:Object.freeze([]),
 allowedTestViberSenderIds:Object.freeze([])
});
