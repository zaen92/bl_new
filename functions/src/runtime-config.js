// CallableOptions.enforceAppCheck accepts a boolean, not a parameter object.
// Both the discovery process and the deployed runtime receive these nonsecret envs.
export function appCheckEnabled(value=process.env.ENFORCE_APP_CHECK){
 if(value===undefined||value==='')return false;
 if(!['true','false'].includes(value))throw new Error('ENFORCE_APP_CHECK must be true or false');
 return value==='true';
}
