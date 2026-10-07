# 来源与依赖

派生基线为用户提供的 0.2.7 用户脚本，其脚本头声明 `@license MIT`、`@author isMobile` 和 `@namespace noshuang`。本项目保留这些声明，新增倍速控制、DeepSeek 接入、平台回读、恢复逻辑和验证工具。公开仓库不包含原始个人文件、课程页面、接口凭证或浏览器缓存。

运行时依赖由脚本管理器按照元数据加载，测试缓存也不进入仓库或安装包：

| 依赖 | 版本 | 许可证与官方来源 |
| --- | --- | --- |
| Vue | 3.4.31 | [MIT](https://github.com/vuejs/core/blob/v3.4.31/LICENSE) |
| Vue Demi | 0.14.7 | [MIT](https://github.com/vueuse/vue-demi/blob/v0.14.7/LICENSE) |
| Element Plus | 2.7.2 JS / 2.8.2 CSS | [MIT](https://github.com/element-plus/element-plus/blob/2.7.2/LICENSE) |
| Pinia | 2.3.1 | [MIT](https://github.com/vuejs/pinia/blob/v2.3.1/LICENSE) |
| RxJS | 7.8.2 | [Apache-2.0](https://github.com/ReactiveX/rxjs/blob/7.8.2/LICENSE.txt) |
| blueimp MD5 | 2.19.0 | [MIT](https://github.com/blueimp/JavaScript-MD5/blob/v2.19.0/LICENSE.txt) |

播放器菜单识别参考 [Video.js 原生倍速菜单](https://docs.videojs.com/control-bar_playback-rate-menu_playback-rate-menu-button.js.html)。项目读取原生 DOM，不重新实现或拦截平台校验。
