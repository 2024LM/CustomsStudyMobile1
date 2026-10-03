import { build } from 'esbuild';
import { DOMParser } from 'linkedom';

// Run exactly the application's parser and pagination in the static news job.
export async function newsEngine() {
  globalThis.DOMParser = class extends DOMParser {
    parseFromString(markup,mime){
      // Browsers create html/body for fragments, whereas LinkeDOM needs a wrapper.
      if(mime==='text/html'&&!/<html\b/i.test(markup))markup='<html><head></head><body>'+markup+'</body></html>';
      return super.parseFromString(markup,mime);
    }
  };
  const result = await build({
    stdin: {contents: `export * from './src/features/news/providers/customProvider';
      export * from './src/features/news/providers/newsPageArchive';
      export * from './src/features/news/providers/sourceAccess';
      export * from './src/features/news/config/defaultSources';
      export * from './src/features/news/providers/newsPagination';`, resolveDir: new URL('../',import.meta.url).pathname,loader:'ts'},
    bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent',
    define:{'import.meta.env.BASE_URL':'"/"'},
  });
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
