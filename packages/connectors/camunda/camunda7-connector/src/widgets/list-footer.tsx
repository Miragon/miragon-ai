import { PagedListFooter, type PagedViewData } from "@miragon-ai/widget-shell/widgets"
import { useT } from "../messages/use-t.js"

/**
 * Module-local i18n binding of the shared {@link PagedListFooter} — binds the
 * load-more / stale-page-0 error, retry and updating strings once so every paged list renders its tail as
 * `<CockpitListFooter paged={paged} noun={…} />`.
 */
export function CockpitListFooter<TItem, TData>({
  paged,
  noun,
}: {
  paged: PagedViewData<TItem, TData>
  noun?: string
}) {
  const t = useT()
  return (
    <PagedListFooter
      paged={paged}
      noun={noun}
      loadMoreErrorText={(message) => t("listFooter.loadMoreError", { message })}
      refreshErrorText={(message) => t("listFooter.refreshError", { message })}
      retryLabel={t("listFooter.retryLoadMore")}
      refreshingText={t("listFooter.refreshing")}
    />
  )
}
