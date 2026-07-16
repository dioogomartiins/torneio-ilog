# Torneio ILOG 🏆⚽

Uma aplicação web moderna concebida para a gestão completa de torneios desportivos entre amigos. Organiza equipas, cria plantéis, mantém uma base de dados de atributos de jogadores, gera calendários (Algoritmo de Berger), introduz resultados de torneios ou jogos singulares, e acompanha estatísticas em tempo real, sincronizadas entre todos os participantes.

## ✨ Funcionalidades Principais

* **Sincronização em Tempo Real (Firebase):** Todos os telemóveis e computadores ligados atualizam instantaneamente quando um resultado ou golo é inserido noutro dispositivo. Sem necessidade de recarregar a página!
* **Base de Dados Global de Jogadores:** Regista jogadores com atributos (Velocidade, Finalização, Passe, Drible, Defesa, Físico) que determinam a sua classificação global (Rating) por estrelas.
* **Organização e Gestão Centralizada:** Um menu de gestão robusto para criar Equipas, alocar jogadores aos Plantéis e gerir as fichas técnicas de cada atleta.
* **Jogo Singular & Draft Simulado:** Ideal para quando não há pessoas suficientes para um torneio inteiro. Permite a duas pessoas criarem um "Jogo Singular", escolhendo os jogadores da Base de Dados de forma interativa para equilibrar ratings (Rating da Equipa A vs Equipa B) e registar golos diretamente para o Histórico.
* **Algoritmo de Berger:** Geração automática e justa do calendário da Liga (incluso números ímpares de equipas), agrupamento e eliminatórias ("mata-mata").
* **Estatísticas e Ficha de Jogador:** Acompanha os melhores marcadores somando todos os golos do Torneio e dos Jogos Singulares, pódios interativos, e clica em qualquer jogador para abrires a sua "Ficha" e veres os seus recordes.
* **Design Premium e Responsivo:** UI/UX super cuidado com tema claro e escuro dinâmico (Dark Mode).

## 🛠️ Tecnologias Utilizadas

Esta é uma Single Page Application construída com tecnologias web nativas e servida estaticamente, otimizada para ser extremamente rápida.

* **HTML5 & CSS3** (Vanilla CSS com sistema de Design)
* **JavaScript (ES Modules)**
* **[Vite](https://vitejs.dev/)** (Ferramenta de *Build* e *Dev Server*)
* **Firebase Realtime Database** (Para sincronização *Serverless* instantânea)

## 🚀 Como Correr Localmente (Desenvolvimento)

Para trabalhar nesta aplicação no teu computador e desfrutar do *Hot Reload* do Vite, segue estes passos:

1. **Clona o repositório:**
   ```bash
   git clone https://github.com/dioogomartiins/torneio-ilog.git
   cd torneio-ilog
   ```

2. **Configura o Firebase:**
   Cria um ficheiro chamado `.env` na raiz do projeto (não faças commit dele para o GitHub!) e insere as tuas chaves do Firebase:
   ```env
   VITE_FIREBASE_API_KEY=tuachave
   VITE_FIREBASE_AUTH_DOMAIN=teudominio.firebaseapp.com
   VITE_FIREBASE_DATABASE_URL=https://teudominio.firebasedatabase.app
   VITE_FIREBASE_PROJECT_ID=teuprojeto
   VITE_FIREBASE_STORAGE_BUCKET=teubucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=id
   VITE_FIREBASE_APP_ID=appid
   VITE_FIREBASE_MEASUREMENT_ID=medicao
   ```

3. **Instala as dependências:**
   O projeto necessita do Node.js instalado.
   ```bash
   npm install
   ```

4. **Inicia o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```
   Acede ao link indicado no terminal (normalmente `http://localhost:5173`).

5. **Gerar Build de Produção:**
   ```bash
   npm run build
   ```

## ☁️ Publicação (Deploy)

A aplicação está configurada para ser publicada de forma estática, por exemplo no **GitHub Pages** ou **Vercel**. 
*(Aviso: Para automatizar o deploy no GitHub Actions com integração do Firebase, não te esqueças de colocar os valores do ficheiro `.env` nos **Repository Secrets** do teu repositório).*
