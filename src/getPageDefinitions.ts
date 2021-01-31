import { getUserFiles } from "./userFiles";
import { assert, assertUsage } from "./utils/assert";
import { isCallable } from "./utils/isCallable";
import * as vite from "vite";
import { sep as pathSep } from "path";

export { getPageDefinitions };
export { Page };

type PageView = unknown;

type HtmlProps = Record<string, string>;

type PageConfig = {
  route?: string | UrlMatcher;
  render?: (view: PageView) => string | Promise<string>;
  html?: (args: { viewHtml: string } & HtmlProps) => string | Promise<string>;
};

type PageId = string;
type Page = {
  pageId: string;
  files: {
    [".html"]?: string;
    [".browser-entry"]?: string;
    [".page"]?: string;
    [".config"]?: string;
  };
  isDefaultTemplate: boolean;
  config: PageConfig;
  matchesUrl: UrlMatcher;
  renderPageHtml: RenderPageHtml;
  view: PageView;
};

type RenderPageHtml = () => Promise<string>;

type UrlMatcher = (url: string) => boolean | number;

async function getPageDefinitions() {
  const userFiles = await getUserFiles();
  console.log("u", userFiles);

  let pagesMap: Record<PageId, Page> = {};
  for (const filePath of userFiles) {
    const { pageId, fileType } = parseFilePath(filePath);

    const isDefaultTemplate = pageId.split(pathSep).slice(-1)[0] === "default";

    const pageDefinition = (pagesMap[pageId] = pagesMap[pageId] || {
      files: {},
      pageId,
      isDefaultTemplate,
    });

    assert(
      fileType === ".page" ||
        fileType === ".config" ||
        fileType === ".html" ||
        fileType === ".browser-entry"
    );
    assert(!(fileType in pageDefinition));
    pageDefinition.files[fileType] = filePath;

    //@ts-ignore
    if (pageDefinition.files[".config"]) {
      pageDefinition.config =
        // @ts-ignore
        await global.viteServer.ssrLoadModule(pageDefinition.files[".config"]);
    }
    if (pageDefinition.files[".page"]) {
      pageDefinition.view =
        // @ts-ignore
        await global.viteServer.ssrLoadModule(pageDefinition.files[".page"]);
    }

    pageDefinition.renderPageHtml = getRenderPageHtml(
      pageDefinition,
      Object.values(pagesMap)
    );

    if (!pageDefinition.isDefaultTemplate) {
      pageDefinition.matchesUrl = getRouteUrlMatcher(
        pageDefinition,
        Object.values(pagesMap)
      );
    }
  }

  let pages = Object.values(pagesMap);
  pages = pages.filter((page) => page.isDefaultTemplate || page.view);
  return pages;
}

function getRenderPageHtml(
  pageDefinition: Page,
  pageDefinitions: Page[]
): RenderPageHtml {
  return async () => {
    const defaultPageDef = getDefaultPageDefinition(pageDefinitions);
    assert(defaultPageDef.config.render); // TODO
    const viewHtml = await defaultPageDef.config.render(pageDefinition.view);
    assert(defaultPageDef.config.html); // TODO
    // TODO: pass initial props
    let html = await defaultPageDef.config.html({
      viewHtml,
      title: "TODO-Title",
    });
    return html;
  };
}
function getDefaultPageDefinition(pageDefinitions: Page[]): Page {
  let defaultPageDefinition;
  pageDefinitions.forEach((pageDef) => {
    if (pageDef.isDefaultTemplate) {
      defaultPageDefinition = pageDef;
    }
  });
  // TODO - provide defaults
  assert(defaultPageDefinition);
  return defaultPageDefinition;
}
function getRouteUrlMatcher(
  pageDefinition: Page,
  pageDefinitions: Page[]
): UrlMatcher {
  return (url) => {
    const route = pageDefinition?.config?.route;
    if (!route) {
      return getMagicRoute(pageDefinition.pageId, pageDefinitions)(url);
    }
    if (typeof route === "string") {
      assert(false); // "TODO: use path-to-regexp"
    }
    if (isCallable(route)) {
      return route(url);
    }
    assert(pageDefinition.files[".config"]);
    assertUsage(
      false,
      `route defined in ${pageDefinition.files[".config"]} should be either a string or a function`
    );
  };
}

function getMagicRoute(pageId: PageId, pageDefinitions: Page[]): UrlMatcher {
  let pageRoute = removeCommonPrefix(pageId, pageDefinitions);
  pageRoute = pageRoute
    .split(pathSep)
    .filter((part) => part !== "index")
    .join("/");
  if (pageRoute === "") pageRoute = "/";
  console.log("pr", pageId, pageRoute);
  return (url: string) => url.toLowerCase() === pageRoute.toLowerCase();
}

function removeCommonPrefix(pageId: PageId, pageDefinitions: Page[]) {
  const pageIds = pageDefinitions
    .filter((pd) => !pd.isDefaultTemplate)
    .map((pd) => pd.pageId);
  const commonPrefix = getCommonPrefix(pageIds);
  console.log("cp", commonPrefix);
  assert(pageId.startsWith(commonPrefix));
  return pageId.slice(commonPrefix.length);
}
function getCommonPrefix(strings: string[]): string {
  const list = strings.concat().sort();
  const first = list[0];
  const last = list[list.length - 1];
  let idx = 0;
  for (; idx < first.length; idx++) {
    if (first[idx] !== last[idx]) break;
  }
  return first.slice(0, idx);
}

function parseFilePath(filePath: string): { pageId: PageId; fileType: string } {
  let [fileType, fileExtension] = filePath.split(".").slice(-2);
  let pageId;
  if (fileExtension === "html") {
    fileType = ".html";
    fileExtension = "";
    pageId = filePath.split(".").slice(0, -1).join(".");
  } else {
    fileType = "." + fileType;
    fileExtension = "." + fileExtension;
    pageId = filePath.split(".").slice(0, -2).join(".");
  }
  /*
  console.log(11);
  console.log(pageId, fileType, fileExtension, filePath);
  console.log(pageId + fileType + fileExtension === filePath);
  console.log(22);
  */
  assert(pageId + fileType + fileExtension === filePath);
  return { fileType, pageId };
}