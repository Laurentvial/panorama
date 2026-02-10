from django.urls import path
from . import views as api_views

urlpatterns = [
    # Notes endpoints
    path('notes/', api_views.NoteListCreateView.as_view(), name='note-list-create'),
    path('notes/delete/<str:pk>/', api_views.NoteDeleteView.as_view(), name='note-delete'),
    path('notes/create/', api_views.NoteListCreateView.as_view(), name='note-create'),
    # Clients endpoints
    path('clients/', api_views.ClientView.as_view(), name='client-list'),
    path('clients/create/', api_views.client_create, name='client-create'),
    path('clients/<str:client_id>/', api_views.client_detail, name='client-detail'),
    path('clients/<str:client_id>/toggle-active/', api_views.client_toggle_active, name='client-toggle-active'),
    path('clients/<str:client_id>/delete/', api_views.client_delete, name='client-delete'),
    path('clients/<str:client_id>/verification-config/', api_views.client_verification_config, name='client-verification-config'),
    path('clients/<str:client_id>/history/', api_views.client_history, name='client-history'),
    path('clients/<str:client_id>/platform-logs/', api_views.client_platform_logs, name='client-platform-logs'),
    # Teams endpoints
    path('teams/', api_views.team_list, name='team-list'),
    path('teams/create/', api_views.team_create, name='team-create'),  # POST for create
    path('teams/<str:team_id>/', api_views.team_detail, name='team-detail'),
    path('teams/<str:team_id>/delete/', api_views.team_delete, name='team-delete'),
    path('teams/<str:team_id>/add-member/', api_views.team_add_member, name='team-add-member'),
    path('teams/<str:team_id>/remove-member/', api_views.team_remove_member, name='team-remove-member'),
    path('teams/<str:team_id>/set-leader/', api_views.team_set_leader, name='team-set-leader'),
    # Users endpoints
    path('user/current/', api_views.get_current_user, name='get-current-user'),
    path('user/profile/', api_views.update_own_profile, name='update-own-profile'),
    # Client authentication endpoints
    path('client/login/', api_views.client_login, name='client-login'),
    path('client/current/', api_views.get_current_client, name='get-current-client'),
    path('client/identity/', api_views.client_update_identity, name='client-update-identity'),
    # Client chat (client <-> manager)
    path('clients/<str:client_id>/chat/', api_views.client_chat, name='client-chat'),
    # Client conversations (threaded messaging)
    path('clients/<str:client_id>/conversations/', api_views.client_conversations, name='client-conversations'),
    path(
        'clients/<str:client_id>/conversations/<str:conversation_id>/messages/',
        api_views.client_conversation_messages,
        name='client-conversation-messages',
    ),
    path('users/', api_views.user_list, name='user-list'),
    path('users/create/', api_views.UserCreateView.as_view(), name='user-create'),
    path('users/<str:user_id>/', api_views.user_delete, name='user-delete'),
    path('users/<str:user_id>/update/', api_views.user_update, name='user-update'),
    path('users/<str:user_id>/toggle-active/', api_views.user_toggle_active, name='user-toggle-active'),
    path('users/<str:user_id>/reset-password/', api_views.user_reset_password, name='user-reset-password'),
    # Assets endpoints
    path('assets/', api_views.asset_list, name='asset-list'),
    path('assets/create/', api_views.asset_create, name='asset-create'),
    path('assets/create-from-alpha-vantage/', api_views.asset_create_from_alpha_vantage, name='asset-create-from-alpha-vantage'),
    # Accept missing trailing slash (CommonMiddleware + POST can otherwise 404)
    path('assets/create-from-alpha-vantage', api_views.asset_create_from_alpha_vantage, name='asset-create-from-alpha-vantage-no-slash'),
    # AI (assets) - must be BEFORE the generic assets/<asset_id>/ route
    path('assets/generate-description/', api_views.asset_generate_description, name='asset-generate-description'),
    path('assets/bulk-update-prices/', api_views.assets_bulk_update_prices, name='assets-bulk-update-prices'),
    path('assets/get-logo/', api_views.asset_get_logo, name='asset-get-logo'),  # Specific route before generic
    path('assets/<str:asset_id>/upload-logo/', api_views.asset_upload_logo, name='asset-upload-logo'),
    path('assets/<str:asset_id>/update-price/', api_views.asset_update_price, name='asset-update-price'),
    path('assets/<str:asset_id>/delete/', api_views.asset_delete, name='asset-delete'),
    path('assets/<str:asset_id>/', api_views.asset_detail, name='asset-detail'),
    path('clients/<str:client_id>/assets/', api_views.client_assets, name='client-assets'),
    path('clients/<str:client_id>/assets/add/', api_views.client_asset_add, name='client-asset-add'),
    path('clients/<str:client_id>/assets/reset/', api_views.client_assets_reset, name='client-assets-reset'),
    path('clients/<str:client_id>/assets/<str:asset_id>/toggle-featured/', api_views.client_asset_toggle_featured, name='client-asset-toggle-featured'),
    path('clients/<str:client_id>/assets/<str:asset_id>/', api_views.client_asset_remove, name='client-asset-remove'),
    # Client Products endpoints
    path('clients/<str:client_id>/products/', api_views.client_products, name='client-products'),
    path('clients/<str:client_id>/products/add/', api_views.client_product_add, name='client-product-add'),
    path('clients/<str:client_id>/products/reset/', api_views.client_products_reset, name='client-products-reset'),
    path('clients/<str:client_id>/products/<str:product_id>/toggle-featured/', api_views.client_product_toggle_featured, name='client-product-toggle-featured'),
    path('clients/<str:client_id>/products/<str:product_id>/', api_views.client_product_remove, name='client-product-remove'),
    # Alpha Vantage endpoints
    path('alpha-vantage/search/', api_views.alpha_vantage_search, name='alpha-vantage-search'),
    path('alpha-vantage/quote/<str:symbol>/', api_views.alpha_vantage_quote, name='alpha-vantage-quote'),
    # FX endpoint (used by client trading modal for EUR-only liquidity)
    path('forex/quote/', api_views.forex_quote, name='forex-quote'),
    # Chart data endpoint
    path('assets/<str:asset_id>/chart-data/', api_views.asset_chart_data, name='asset-chart-data'),
    # RIBs endpoints
    path('ribs/', api_views.rib_list, name='rib-list'),
    path('ribs/create/', api_views.rib_create, name='rib-create'),
    path('ribs/<str:rib_id>/', api_views.rib_update, name='rib-update'),
    path('ribs/<str:rib_id>/delete/', api_views.rib_delete, name='rib-delete'),
    path('clients/<str:client_id>/ribs/', api_views.client_ribs, name='client-ribs'),
    path('clients/<str:client_id>/ribs/add/', api_views.client_rib_add, name='client-rib-add'),
    path('clients/<str:client_id>/ribs/<str:rib_id>/', api_views.client_rib_remove, name='client-rib-remove'),
    # Client Documents endpoints
    path('clients/<str:client_id>/documents/', api_views.client_documents, name='client-documents'),
    path('clients/<str:client_id>/documents/create/', api_views.client_document_create, name='client-document-create'),
    path('clients/<str:client_id>/documents/<str:document_id>/delete/', api_views.client_document_delete, name='client-document-delete'),
    # Useful Links endpoints
    path('useful-links/', api_views.useful_link_list, name='useful-link-list'),
    path('useful-links/create/', api_views.useful_link_create, name='useful-link-create'),
    path('useful-links/<str:useful_link_id>/', api_views.useful_link_update, name='useful-link-update'),
    path('useful-links/<str:useful_link_id>/delete/', api_views.useful_link_delete, name='useful-link-delete'),
    path('clients/<str:client_id>/useful-links/', api_views.client_useful_links, name='client-useful-links'),
    path('clients/<str:client_id>/useful-links/add/', api_views.client_useful_link_add, name='client-useful-link-add'),
    path('clients/<str:client_id>/useful-links/<str:useful_link_id>/', api_views.client_useful_link_remove, name='client-useful-link-remove'),
    # Stats endpoint
    path('stats/', api_views.stats, name='stats'),
    # Transactions endpoints
    path('transactions/', api_views.all_transactions, name='all-transactions'),
    # Positions endpoints
    path('positions/', api_views.positions_list, name='positions-list'),
    path('clients/<str:client_id>/positions/', api_views.client_positions, name='client-positions'),
    path('clients/<str:client_id>/transactions/', api_views.client_transactions, name='client-transactions'),
    path('clients/<str:client_id>/transactions/create/', api_views.client_transaction_create, name='client-transaction-create'),
    path('clients/<str:client_id>/transactions/<str:transaction_id>/generate-rates/', api_views.transaction_generate_rates, name='transaction-generate-rates'),
    path('clients/<str:client_id>/transactions/<str:transaction_id>/generate-positions/', api_views.transaction_generate_positions, name='transaction-generate-positions'),
    path('clients/<str:client_id>/transactions/<str:transaction_id>/save-positions/', api_views.transaction_save_positions, name='transaction-save-positions'),
    path('clients/<str:client_id>/transactions/<str:transaction_id>/delete/', api_views.client_transaction_delete, name='client-transaction-delete'),
    path('clients/<str:client_id>/transactions/<str:transaction_id>/logs/', api_views.transaction_logs, name='transaction-logs'),
    path('clients/<str:client_id>/transactions/<str:transaction_id>/', api_views.client_transaction_update, name='client-transaction-update'),
    # Product Categories endpoints
    path('categories/', api_views.category_list, name='category-list'),
    path('categories/create/', api_views.category_create, name='category-create'),
    path('categories/<str:category_id>/update/', api_views.category_update, name='category-update'),
    path('categories/<str:category_id>/delete/', api_views.category_delete, name='category-delete'),
    # Products endpoints
    path('products/', api_views.product_list, name='product-list'),
    path('products/create/', api_views.product_create, name='product-create'),
    # AI Generation endpoints - MUST be before product_id routes to avoid conflicts
    path('products/generate-description/', api_views.product_generate_description, name='product-generate-description'),
    path('products/generate-description', api_views.product_generate_description, name='product-generate-description-no-slash'),
    path('products/generate-cgv/', api_views.product_generate_cgv, name='product-generate-cgv'),
    path('products/generate-cgv', api_views.product_generate_cgv, name='product-generate-cgv-no-slash'),
    # Product detail routes - must be after specific routes
    path('products/<str:product_id>/', api_views.product_detail, name='product-detail'),
    path('products/<str:product_id>/contract-pdf/', api_views.product_contract_pdf, name='product-contract-pdf'),
    path('products/<str:product_id>/update/', api_views.product_update, name='product-update'),
    path('products/<str:product_id>/delete/', api_views.product_delete, name='product-delete'),
    path('products/<str:product_id>/toggle-active/', api_views.product_toggle_active, name='product-toggle-active'),
    path('products/<str:product_id>/duplicate/', api_views.product_duplicate, name='product-duplicate'),
    # App Settings endpoints
    path('settings/', api_views.app_settings, name='app-settings'),
    # News Posts endpoints
    path('news/', api_views.news_list, name='news-list'),
    path('news/all/', api_views.news_list_all, name='news-list-all'),
    path('news/create/', api_views.news_create, name='news-create'),
    path('news/fetch-from-api/', api_views.news_fetch_from_api, name='news-fetch-from-api'),
    path('news/import-from-api/', api_views.news_import_from_api, name='news-import-from-api'),
    path('news/bulk-import-from-api/', api_views.news_bulk_import_from_api, name='news-bulk-import-from-api'),
    path('news/<str:news_id>/update/', api_views.news_update, name='news-update'),
    path('news/<str:news_id>/delete/', api_views.news_delete, name='news-delete'),
    # Media proxy endpoint for CORS-compliant image serving
    path('media/<path:file_path>/', api_views.media_proxy, name='media-proxy'),
]
