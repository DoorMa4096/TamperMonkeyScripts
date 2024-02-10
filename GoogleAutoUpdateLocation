// ==UserScript==
// @name         google location auto update
// @namespace    http://tampermonkey.net/
// @version      0.3.0
// @description  update google location automatically
// @author       Door Ma
// @match        https://www.google.com/search?q=*
// @match        https://bard.google.com/chat*
// @match        https://gemini.google.com/app*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    setInterval(function() {
        // 获取需要点击的元素
        let element_search = document.querySelector('update-location');
        let element_gemini = document.querySelector('.update-location-text.location-clickable');

        // 检查元素是否存在
        if (element_search) {
            // 模拟用户点击
            element_search.click();
        } else if (element_gemini) {
            // 模拟用户点击
            element_gemini.click();
        } else {
            console.log('未找到更新按钮');
            alert('未找到更新按钮');
        }
    }, 60000); // 毫秒 执行一次位置提交

})();