# Internationalisation

User-facing strings (the authoring tool UI, server-side messages, and error
copy) are **not** hard-coded in the modules that display them. They live in
JSON langpacks, are merged by the core `Lang` service, served to the frontend
over a public HTTP endpoint, and consumed in React via a `t()` helper.

This guide covers the UI/app-string path: where strings live, how they're
served, how to consume them, and how to add new ones.

## Where strings live

Strings live in **langpack modules**, keyed by locale and namespace:

```
lang/<locale>/<namespace>.json
```

The canonical pack is `@cgkineo/adapt-authoring-langpack-en`, which ships:

```
lang/en/app.json     # UI strings  -> namespaced "app.*"
lang/en/error.json   # error copy  -> namespaced "error.*"
```

`app.json` is a flat key/value map (no nesting), e.g.:

```json
{
  "save": "Save",
  "projects": "Projects",
  "addedcontent": "Added ${type}",
  "members": "${count} members",
  "deletegroupconfirm": "Delete ${name}? Removes it from ${count} users."
}
```

**The filename is the namespace.** The core loader prefixes every key in a
file with the file's path under `lang/<locale>/`. So `app.json`'s `save`
becomes `app.save`, and `error.json`'s `DUPL_USER` becomes `error.DUPL_USER`.
This is why the UI calls `t('app.save')` even though the JSON key is just
`"save"`.

> Do not add UI copy directly to the UI module. Add the key to a langpack and
> reference it with `t('app.key')`.

## How strings are loaded and merged

Loading is handled by the core `Lang` service
(`adapt-authoring-core/lib/Lang.js`), constructed by `App` at startup with the
configured `defaultLang` (`adapt-authoring-core.defaultLang`, default `"en"`).

`Lang.loadPhrases()` globs `lang/**/*.json` across the application root **and
every installed dependency**, then merges them into `this.phrases`, keyed by
locale:

```js
// for each lang/<locale>/<...path>.json
const lang = parts[0]                                   // e.g. "en"
const prefix = parts.slice(1).join('.') + '.'           // e.g. "app."
Object.entries(contents).forEach(([k, v]) => {
  this.phrases[lang][`${prefix}${k}`] = v               // -> "app.save"
})
```

Because every dependency is scanned, **any module can ship its own
`lang/<locale>/app.json`** to contribute strings; they all merge into the same
flat per-locale map. (At time of writing, `adapt-authoring-multilang`,
`adapt-authoring-collab`, `adapt-authoring-walkthrough`, and
`adapt-authoring-docs-server` each ship one alongside the main langpack.)

`app.lang.supportedLanguages` is simply `Object.keys(this.phrases)` — the set
of locales for which at least one file was found.

## How strings are served

The middleware module exposes a **public** endpoint (`permissions.get: null`,
no auth) that returns the merged phrase map for one locale:

```
GET /api/lang/:lang
```

Handler (`MiddlewareModule.langRequestHandler`):

```js
langRequestHandler (req, res, next) {
  const lang = req.params.lang || req.acceptsLanguages(this.app.lang.supportedLanguages)
  if (!lang || !this.app.lang.phrases[lang]) {
    return next(this.app.errors.UNKNOWN_LANG.setData({ lang }))
  }
  res.json(this.app.lang.phrases[lang])
}
```

The response body is the flat `{ "app.save": "Save", ... }` map for that
locale. An unsupported locale yields an `UNKNOWN_LANG` error.

Server-side code can also translate without HTTP. The middleware decorates
every API request with `req.translate(key, data)` (via `addTranslationUtils`),
which delegates to `app.lang.translate(lang, key, data)` using the request's
`Accept-Language`.

## How the UI consumes strings

The consumer helper is `adapt-authoring-ui/ui/utils/lang.js`.

`loadLang(locale)` fetches `/api/lang/:locale` once and caches it forever
(`staleTime: Infinity`). The default locale is the browser language. It is
called at bootstrap (`ui/main.jsx`) before the app renders:

```js
Promise.all([loadConfig(), loadLang()]).then(() => { /* mount app */ })
```

`t(key, data)` reads the cached map and returns the string (or the key itself
if missing, so a missing key is visible but non-fatal):

```js
export function t (key, data) {
  const phrases = getApiQueryData('lang')
  if (!phrases) throw new Error('Lang not loaded. Call loadLang() first.')
  const phrase = phrases[key]
  return !phrase ? key : !data ? phrase
    : phrase.replace(/\$\{(\w+)\}/g, (_, name) => data[name] ?? '')
}
```

### Interpolation

The UI `t()` supports `${name}` placeholders only, substituted from the `data`
argument (a missing value substitutes the empty string):

```jsx
// app.json:  "addedcontent": "Added ${type}"
t('app.addedcontent', { type: 'block' })   // -> "Added block"

// app.json:  "members": "${count} members"
t('app.members', { count: 4 })             // -> "4 members"
```

Plain calls with no data return the string verbatim:

```jsx
import { t } from '@adapt-ui/utils/lang'   // (path per UI alias)

<ActionButton icon={Icons.Save}>{t('app.save')}</ActionButton>
<IconButton aria-label={t('app.close')} />
```

> **Server vs UI interpolation differ.** The server-side `Lang.substituteData`
> additionally supports a `$map{key:attrs:delim}` form for arrays (used by some
> `error.*` strings). The UI `t()` implements **only** `${name}` — do not rely
> on `$map{}` in strings rendered through the UI helper.

## Adding a new UI string

1. Add the key to `lang/en/app.json` in
   `@cgkineo/adapt-authoring-langpack-en` (or to your module's own
   `lang/en/app.json` if the string is module-specific). Keep keys flat and
   lowercase; use `${var}` for dynamic values.

   ```json
   "duplicateproject": "Duplicate ${title}"
   ```

2. Reference it in the UI with the `app.` namespace prefix:

   ```jsx
   t('app.duplicateproject', { title: project.title })
   ```

3. Rebuild the UI (it is a Vite build, not served from source) and restart the
   server so the new key is picked up by the langpack loader.

There is no separate registration step — dropping the key into a scanned
`lang/<locale>/*.json` file is enough.

## Adding a locale or an additional langpack

- **A new locale in an existing pack:** add `lang/<locale>/app.json` (and
  `error.json`) alongside the `en` files. It will appear in
  `supportedLanguages` and be served at `/api/lang/<locale>`.
- **A new langpack module:** publish a package containing `lang/<locale>/*.json`
  and install it as a dependency. Langpack-only packages set
  `"module": false` in `adapt-authoring.json` (they contribute strings but do
  not extend `AbstractModule`); the core loader still scans their `lang/`
  directory. Locales fall back to `defaultLang` server-side when a request
  locale is unknown.
