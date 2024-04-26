import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { invoke } from '@tauri-apps/api'

invoke('greet', { name: 'Tauri' }).then((response) => console.log(response))

createApp(App).mount('#app')
