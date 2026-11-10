'use strict';
// Eligibility is fixed when the payment commits; enabling delivery later must
// never backfill historical or previously simulated events.
function eligibility(policy,createdAt){
 const activated=Date.parse(policy.automaticDeliveryActivatedAt),created=Date.parse(createdAt);
 return {externalDeliveryEligible:policy.externalSendingAuthorized===true&&Number.isFinite(activated)&&Number.isFinite(created)&&created>=activated,deliveryActivation:policy.automaticDeliveryActivatedAt||null};
}
function mayDeliver(policy,context){
 return context.externalDeliveryEligible===true&&typeof context.deliveryActivation==='string'&&context.deliveryActivation===policy.automaticDeliveryActivatedAt&&eligibility(policy,context.createdAt).externalDeliveryEligible;
}
module.exports={eligibility,mayDeliver};
