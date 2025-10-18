import { onRequest as __api_profile_js_onRequest } from "E:\\source\\Vauthunters Rewards\\functions\\api\\profile.js"
import { onRequest as __img_js_onRequest } from "E:\\source\\Vauthunters Rewards\\functions\\img.js"

export const routes = [
    {
      routePath: "/api/profile",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_profile_js_onRequest],
    },
  {
      routePath: "/img",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__img_js_onRequest],
    },
  ]