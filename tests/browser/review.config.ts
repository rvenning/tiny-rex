import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';
// Match a normal GPU-backed Windows browser for the isolated production review.
// Keep WebKit's iPad project unchanged.
export default defineConfig({...base,testDir:'.',projects:base.projects?.map(project=>project.name==='chromium'?{...project,use:{...project.use,launchOptions:{args:['--use-angle=d3d11']}}}:project),use:{...base.use,baseURL:'http://127.0.0.1:4177/tiny-rex/'},webServer:undefined});
