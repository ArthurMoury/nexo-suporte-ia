import {createAgentHandler} from '../../src/python-proxy.mjs';
export default createAgentHandler();
export const config={path:['/api/chat','/api/config','/api/connection'],rateLimit:{windowLimit:12,windowSize:60,aggregateBy:'ip'}};
