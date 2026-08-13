from rest_framework.pagination import PageNumberPagination


class JobPagination(PageNumberPagination):
    """Larger default page than DRF's, because the table virtualises its rows.

    Fetching 50 and rendering ~15 beats fetching 25 and paging twice as often; the cap
    stops a client asking for the whole table in one request.
    """

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200
