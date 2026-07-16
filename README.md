# Torneio ILOG 🏆⚽

Uma aplicação web moderna e *client-side* concebida para a gestão completa de torneios desportivos. Organiza equipas, gera calendários utilizando o Algoritmo de Berger, introduz resultados, calcula classificações em tempo real e desenha eliminatórias (mata-mata) automaticamente.

## ✨ Funcionalidades Principais

* **Organização de Equipas e Plantéis:** Adiciona equipas e jogadores individuais (com número e nome) aos plantéis.
* **Algoritmo de Berger:** Geração inteligente e automática do calendário (mesmo para números ímpares de equipas) onde o sistema gere as jornadas e os descansos.
* **Tabelas Classificativas Automáticas:** Acompanha pontos, golos marcados/sofridos, diferença de golos, vitórias, empates e derrotas baseados nos resultados guardados.
* **Estatísticas e Pódios:** Destaques dos melhores marcadores, pódios interativos e sumários de golos globais do torneio.
* **Mata-Mata (Play-offs):** Quando a fase de grupos termina, gera automaticamente uma chave de eliminatórias (Quartos, Meias, Final) consoante os qualificados.
* **Dark Mode:** Transição suave entre temas claro e escuro.
* **Persistência Local (Offline-first):** Tudo é guardado diretamente no teu *browser* via `localStorage`. Pode ser utilizado completamente offline sem necessidade de backend.

## 🛠️ Tecnologias Utilizadas

Esta é uma Single Page Application construída com tecnologias web nativas e servida estaticamente, otimizada para ser extremamente rápida.

* **HTML5 & CSS3** (Vanilla CSS para o sistema de Design *Premium*)
* **JavaScript (ES Modules)**
* **[Vite](https://vitejs.dev/)** (Ferramenta de *Build* e *Dev Server*)

## 🚀 Como Correr Localmente (Desenvolvimento)

Para trabalhar nesta aplicação no teu computador e desfrutar do *Hot Reload* do Vite, segue estes passos:

1. **Clona o repositório:**
   ```bash
   git clone https://github.com/dioogomartiins/torneio-ilog.git
   cd torneio-ilog
   ```

2. **Instala as dependências:**
   O projeto necessita do Node.js instalado.
   ```bash
   npm install
   ```

3. **Inicia o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```
   Acede ao link indicado no terminal (normalmente `http://localhost:5173`) e poderás ver as atualizações em tempo real cada vez que guardares um ficheiro.

4. **Gerar Build de Produção:**
   ```bash
   npm run build
   ```

## ☁️ Publicação (Deploy)

A aplicação está configurada para ser publicada de forma 100% automática no **GitHub Pages**. 

Sempre que um novo `commit` é enviado para o ramo principal (main/master), o ficheiro `.github/workflows/deploy.yml` orquestra uma **GitHub Action** que:
1. Descarrega o código.
2. Compila uma versão ultra minificada usando o Vite.
3. Publica a pasta `dist` na infraestrutura de servidores rápidos do GitHub.

*(Nota: Nas definições do repositório no GitHub, em **Pages**, o Source deve estar definido como **GitHub Actions** para esta funcionalidade operar corretamente).*
