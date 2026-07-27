import { PagedListFooter, type PagedViewData } from "@miragon-ai/widget-shell/widgets"
import { useT } from "../messages/use-t.js"

/**
 * Module-local i18n binding of the shared {@link PagedListFooter} — binds the
 * load-more error/retry strings once so every paged list renders its tail as
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
      retryLabel={t("listFooter.retryLoadMore")}
    />
  )
}
