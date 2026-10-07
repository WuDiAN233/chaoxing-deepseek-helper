// ==UserScript==
// @name         网课小助手｜DeepSeek 答题｜1–10倍速
// @namespace    noshuang
// @version      0.3.15
// @author       isMobile
// @description  学习通、智慧树课程助手：1–10倍速、DeepSeek结构化答题、填写验证。使用个人DeepSeek API Key，无第三方付费题库。
// @license      MIT
// @homepageURL  https://github.com/WuDiAN233/chaoxing-deepseek-helper
// @downloadURL  https://raw.githubusercontent.com/WuDiAN233/chaoxing-deepseek-helper/main/chaoxing-deepseek-helper.user.js
// @updateURL    https://raw.githubusercontent.com/WuDiAN233/chaoxing-deepseek-helper/main/chaoxing-deepseek-helper.meta.js
// @icon         data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext x='50' y='54' text-anchor='middle' dominant-baseline='central' font-size='82' font-family='Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif'%3E%F0%9F%92%AF%3C/text%3E%3C/svg%3E
// @match        *://*.chaoxing.com/*
// @match        *://*.edu.cn/*
// @match        *://*.nbdlib.cn/*
// @match         *://*.hnsyu.net/*
// @match        *://*.gdhkmooc.com/*
// @match        *://*.zhihuishu.com/*
// @require      https://lib.baomitu.com/vue/3.4.31/vue.global.prod.js
// @require      https://lib.baomitu.com/vue-demi/0.14.7/index.iife.js
// @require      data:application/javascript,window.Vue%3DVue%3B
// @require      https://lib.baomitu.com/element-plus/2.7.2/index.full.min.js
// @require      https://lib.baomitu.com/pinia/2.3.1/pinia.iife.min.js
// @require      https://lib.baomitu.com/rxjs/7.8.2/rxjs.umd.min.js
// @require      https://lib.baomitu.com/blueimp-md5/2.19.0/js/md5.min.js
// @resource     ElementPlus       https://lib.baomitu.com/element-plus/2.7.2/index.css
// @resource     ElementPlusStyle  https://lib.baomitu.com/element-plus/2.8.2/index.min.css
// @resource     ttf               https://www.forestpolice.org/ttf/2.0/table.json
// @connect      api.deepseek.com
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_getValue
// @grant        GM_info
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==
