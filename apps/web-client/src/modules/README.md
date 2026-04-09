# Feature modules (`src/modules/`)

Aligned with **`docs/PROJECT_PLAN.md` §10.1** and **`docs/PROJECT_GUIDELINES.md` §4.0**. Each **`<module-id>/`** owns a product area and may contain:

| Subfolder | Purpose |
|-----------|---------|
| **`pages/`** | Route-level screens (see **Page naming** below). |
| **`components/`** | UI used only inside this module. |
| **`stores/`** | Redux slices (or re-exports) owned by the module. |
| **`api/`** | Thin REST helpers when calls are module-specific (shared HTTP stays in **`common/api/`**). |
| **`constants/`**, **`utils/`**, **`types/`** | Module-local constants, helpers, and view types. |

## Module IDs (current)

| Module | Routes / scope (today) |
|--------|-------------------------|
| **`home`** | Authenticated home (`/`). |
| **`settings`** | Settings (`/settings`). |
| **`auth`** | Login, register, verify email (`/login`, **`/register`**, **`/verify-email`**). Also owns **`SessionRestore`**, Redux **`auth`** slice + selectors, **`apiError`** / **`applyAuthResponse`** / **`authStorage`** / **`sessionBootstrap`** under **`modules/auth/{components,stores,utils}/`**. |
| **`app`** | No routes — holds the minimal Redux **`app`** slice (shell / bootstrap placeholder) in **`stores/appSlice.ts`**. |

## Page naming (single convention)

Put **route entry components** in **`<module>/pages/`** using **`PascalCase`** and a **`Page`** suffix:

- **`HomePage.tsx`**, **`SettingsPage.tsx`**, **`LoginPage.tsx`**, **`RegisterPage.tsx`**, **`VerifyEmailPage.tsx`**

Do **not** mix styles (e.g. avoid `page.tsx` at module root for one module and `pages/HomePage.tsx` for another). Colocated tests: **`HomePage.test.tsx`** next to **`HomePage.tsx`**.

Route screens live under **`modules/<id>/pages/`** (see **`App.tsx`** imports).
