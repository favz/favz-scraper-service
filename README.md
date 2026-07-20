
```markdown
# FAVZ Scraper Service

Serverless product scraper using Playwright on Vercel.

## Marketplaces Supported
- Shopee
- Mercado Livre
- AliExpress  
- Amazon

## API Endpoint

```
GET /api/scrape?url=<PRODUCT_URL>
```

## Response

```json
{
  "success": true,
  "marketplace": "shopee",
  "product": {
    "name": "Nome do Produto",
    "price": "199.90",
    "image": "https://...",
    "brand": "",
    "seller": "",
    "rating": 4.5
  }
}
```

## Deploy

Automatically deploys on push to main branch via Vercel.
```

---

### 4️⃣ Criar Conta no Vercel

1. Acesse: https://vercel.com/signup
2. Clique em **Continue with GitHub**
3. Autorize o Vercel no GitHub

### 5️⃣ Fazer Deploy

1. No Vercel, clique em **Add New Project**
2. Selecione o repositório `favz-scraper-service`
3. Clique em **Import**
4. **NÃO** altere nenhuma configuração
5. Clique em **Deploy**
6. Aguarde ~2 minutos
7. Copie a URL do projeto (algo como: `favz-scraper-service.vercel.app`)

### 6️⃣ Testar o Scraper

Abra no navegador:
```
https://SEU-PROJETO.vercel.app/api/scrape?url=https://s.shopee.com.br/W5Agfz46M
```

Deve retornar JSON com os dados do produto!

### 7️⃣ Integrar com o PHP

Edite o arquivo `scraper-api.php` no seu servidor:

```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$url = isset($_GET['url']) ? trim($_GET['url']) : '';

if (empty($url)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'URL não fornecida']);
    exit;
}

// URL do seu serviço Vercel
$vercelUrl = 'https://SEU-PROJETO.vercel.app/api/scrape';
$apiUrl = $vercelUrl . '?url=' . urlencode($url);

// Fazer requisição para o Vercel
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $apiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 45);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200 || !$response) {
    echo json_encode([
        'success' => false,
        'error' => 'Erro ao buscar dados do produto'
    ]);
    exit;
}

// Retornar resposta do Vercel
echo $response;
?>
```
