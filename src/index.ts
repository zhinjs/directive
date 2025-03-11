export class Directive<Rest extends unknown[]=unknown[],A extends any[]=[],O={}>{
    #options:Record<string,Directive.OptionConfig>={}
    #args:Directive.ArgConfig[]=[]
    #callbacks:Directive.Callback<Rest,A,O>[]=[]
    constructor(public name:string,public description?:string){
    }
    arg<T extends Directive.DomainDataType,R extends Directive.ValueConfig<T,boolean>>(type:T,options?:R):Directive<Rest,[...A,Directive.IsRequiredArg<Directive.ArgType<T>,R>],O>{
        const [realType,rest]=Directive.resolveType(type)
        this.#args.push({...options,rest,type:realType})
        return this as unknown as Directive<Rest,[...A,Directive.IsRequiredArg<Directive.ArgType<T>,R>],O>
    }
    option<S extends string,T extends Directive.DomainDataType,R extends Directive.WithAlias<T,boolean>>(name:S,type:T,options?:R):Directive<Rest,A,O & Directive.OptionType<S,T,R>>{
        const [realType,rest]=Directive.resolveType(type)
        this.#options[name]={...options,rest,type:realType}
        return this as unknown as Directive<Rest,A,O & Directive.OptionType<S,T,R>>
    }
    handle(callback:Directive.Callback<Rest,A,O>){
        this.#callbacks.push(callback)
        return this as unknown as Directive<Rest,A,O>;
    }
    #matchOption(name:string,option:Directive.OptionConfig,argv:string[],options:Record<string,any>){
        const {alias,type}=option
        for(let idx=0;idx<argv.length;idx++){
            const arg=argv[idx]
            if(!arg.startsWith('-')) continue
            const validator=Directive.createValidator(type)
            if(arg===`--${name}`||arg===`-${alias}`){
                if(option.rest){
                    const res=argv.slice(idx+1).map(validator.transform)
                    if(res.every(validator.validate)){
                        options[name]=res
                        argv.splice(idx,argv.length-idx)
                        return
                    }
                }
                const value=argv[idx+1]
                switch (type){
                    case 'boolean':{
                        options[name]=validator.transform(value)
                        if(['true','false'].includes(value)) argv.splice(idx,2);
                        else argv.splice(idx,1)
                        break
                    }
                    case 'string':
                    case "number":{
                        const res=validator.transform(value)
                        if(validator.validate(res)){
                            options[name]=res
                            argv.splice(idx,2)
                        }
                        break;
                    }
                }
            }
        }
    }
    #matchOptions(argv:string[]):[O,string[]]{
        const options:Record<string, any>={}
        for(const name in this.#options){
            this.#matchOption(name,this.#options[name],argv,options)
            if(options[name]===undefined) options[name]=this.#options[name].initialValue
            if(options[name]===undefined && this.#options[name].required){
                throw new Error(`option ${name} is required`)
            }
        }
        return [options as O,argv]
    }

    #matchArgs(argv:string[]){
        const args=[]
        for(let index=0;index<this.#args.length;index++){
            this.#matchArg(index,this.#args[index],argv,args)
            // unMatched, set to initial value
            if(args[index]===undefined && this.#args[index].initialValue) args[index]=this.#args[index].initialValue
            // unMatched and required, throw error
            if(args[index]===undefined && this.#args[index].required){
                throw new Error(`argument of index ${index} is required`)
            }
        }
        return args as A
    }
    #matchArg(index:number,arg:Directive.ArgConfig,argv:string[],args:any[]) {
        const {type, rest} = arg
        const validator = Directive.createValidator(type)
        if(rest){
            args[index]=argv.map(validator.transform)
            argv.splice(0,argv.length)
            return;
        }
        const value=argv[0]
        if(value && !value.startsWith('-')) {
            switch (type) {
                case 'string':
                case 'number':{
                    const res=validator.transform(value)
                    if(validator.validate(res)) {
                        args[index]=res
                        argv.shift()
                    }
                    break
                }
                case 'boolean':{
                    const res=validator.transform(value)
                    if(validator.validate(res)) {
                        args[index]=res
                        argv.shift()
                    }
                    break
                }
            }
        }
    }
    #match(argv:string[]):Directive.Matched<A,O>{
        const [options,newArgv]=this.#matchOptions(argv)
        return {options, args:this.#matchArgs(newArgv)}
    }
    get help(){
        const options=Object.entries(this.#options).map(([name,option])=>{
            const {alias,type,description}=option
            return `--${name},-${alias} <${type}> ${description}`
        }).join('\n')
        const args=this.#args.map((arg,index)=>{
            const {type,description}=arg
            return `<${type}> ${description}`
        }).join('\n')
        return `${this.name} ${this.description}\n${options}\n${args}`
    }
    async match(message:string,...rest:Rest){
        const [name,...args]=message.split(/\s+/)
        if(!name||name!==this.name) return
        const ctx=this.#match([...args])
        for(const callback of this.#callbacks){
            const result=await callback(ctx,...rest)
            if(result) return result
        }
    }
}
export namespace Directive{
    interface DataTypeMap{
        string:string
        number:number
        boolean:boolean
    }
    export type WithType<R,T extends DataType=DataType>=R & {
        type:T
    }
    export interface ValueConfig<T extends DomainDataType=DomainDataType,R extends boolean=boolean>{
        description?:string
        initialValue?:ArgType<T>
        rest?:boolean
        required?:R
    }
    export type Matched<A extends any[]=[],O={}>={
        args:A
        options:O
    }
    export type Awaitable<T>=T|Promise<T>
    export type Callback<Rest extends unknown[]=unknown[],A extends any[]=[],O={}>=(matched:Matched<A,O>,...args:Rest)=>Awaitable<string|void>
    export type OptionConfig=WithType<WithAlias>
    export type ArgConfig=WithType<ValueConfig>
    export interface WithAlias<T extends DomainDataType=DomainDataType,R extends boolean=boolean> extends ValueConfig<T,R>{
        alias?:string
    }
    export type IsRequiredArg<T,R extends ValueConfig>=R extends ValueConfig<infer L,infer R>?R extends true?T:T|undefined:T
    export type DataType=keyof DataTypeMap
    export type DataTypes=`${DataType}[]`
    export type DomainDataType=DataType|DataTypes
    export type ArgType<S>=S extends DataType?DataTypeMap[S]:S extends `${infer T}[]`?T extends DataType?DataTypeMap[T][]:T[]:never
    export type OptionType<N extends string,T extends DomainDataType,R extends WithAlias>={
        [K in N]:IsRequiredArg<ArgType<T>, R>
    }
    export function createValidator<T extends DataType>(type:T):Validator<T>{
        const transformMap:{ [key in DataType]:(value:string)=>ArgType<key> }={
            string:(input)=>input,
            number:(input)=>parseFloat(input),
            boolean:(input)=>input==='true'
        }
        const validateMap:{ [key in DataType]:(value:any)=>boolean }={
            string:(input)=>typeof input==='string',
            number:(input)=>typeof input==='number' && !isNaN(input),
            boolean:(input)=>typeof input==='boolean'
        }
        return {
            transform:(input)=>transformMap[type](input),
            validate:(value)=>validateMap[type](value)
        }
    }
    export type Validator<T extends DataType>={
        transform:(value:string)=>ArgType<T>
        validate:(value:any)=>boolean
    }
    export function resolveType<T extends DomainDataType>(type:T):[DataType,boolean]{
        if(type.endsWith('[]')) return [type.slice(0,-2) as DataType,true]
        return [type as DataType,false]
    }
}
export default Directive
