# @zhinjs/directive
- a simple raw directive parser for nodejs
## install
```bash
npm install @zhinjs/directive
# or
yarn add @zhinjs/directive
# or
pnpm add @zhinjs/directive
```
## usage
```typescript
import { Directive } from '@zhinjs/directive'
const directive = new Directive('hello')
    .arg('string',{required:true})
    .arg('number',{inititalValue:0})
    .option('foo','boolean',{alias:'f'})
    .handle(async ({args, options})=>{
        console.log(args, options);
    });
directive.match('hello "world" -f');
```
