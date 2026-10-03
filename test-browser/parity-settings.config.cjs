// Disposable synthetic fixture databases only. This suite deliberately records
// legacy defects as failures; it is separate from the normal app smoke suite.
const {defineConfig}=require('@playwright/test');
const projects=['old','new'].map(name=>{
 const baseURL=process.env['PARITY_SETTINGS_'+name.toUpperCase()+'_URL'];
 if(!baseURL||!['127.0.0.1','localhost'].includes(new URL(baseURL).hostname))throw new Error('Provide loopback PARITY_SETTINGS_OLD_URL and PARITY_SETTINGS_NEW_URL for isolated synthetic fixtures');
 return {name,use:{baseURL}};
});
module.exports=defineConfig({globalSetup:require.resolve('./parity-settings-guard.cjs'),testDir:'.',testMatch:/parity-settings-.*\.spec\.cjs/,timeout:90000,workers:1,retries:0,reporter:[['list'],['json',{outputFile:process.env.SETTINGS_REPORT||'test-results/parity-settings.json'}]],outputDir:'test-results/parity-settings',use:{headless:true,viewport:{width:1920,height:1080},screenshot:'only-on-failure',trace:'off',launchOptions:process.env.PARITY_CHROMIUM_PATH?{executablePath:process.env.PARITY_CHROMIUM_PATH}:{}},projects});
