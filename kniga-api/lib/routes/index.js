// Все адреса сервера в одном месте: на бесплатном Vercel можно не больше 12 функций, поэтому они собраны в одну (api/[...path].js).
import checkout from "./checkout.js";
import claim from "./claim.js";
import layout from "./layout.js";
import payReturn from "./pay-return.js";
import platformLogin from "./platform-login.js";
import pushConfig from "./push-config.js";
import pushPing from "./push-ping.js";
import pushSubscribe from "./push-subscribe.js";
import pushTick from "./push-tick.js";
import pushUnsubscribe from "./push-unsubscribe.js";
import roomAck from "./room-ack.js";
import roomCreate from "./room-create.js";
import roomInbox from "./room-inbox.js";
import roomInfo from "./room-info.js";
import roomSubmit from "./room-submit.js";
import status from "./status.js";
import verify from "./verify.js";

export const ROUTES = {
  checkout,
  claim,
  layout,
  "pay-return": payReturn,
  "platform-login": platformLogin,
  "push-config": pushConfig,
  "push-ping": pushPing,
  "push-subscribe": pushSubscribe,
  "push-tick": pushTick,
  "push-unsubscribe": pushUnsubscribe,
  "room-ack": roomAck,
  "room-create": roomCreate,
  "room-inbox": roomInbox,
  "room-info": roomInfo,
  "room-submit": roomSubmit,
  status,
  verify,
};
