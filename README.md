# Transformador de Fórmulas Lógicas

## 📌 Descrição do Projeto
Este projeto foi desenvolvido como parte da disciplina de **Programação Lógica**, cujo desafio consiste em implementar uma **página web** capaz de receber uma fórmula lógica bem formada em **LaTeX** e transformá-la passo a passo em diferentes formas normais:

- **Forma Normal Conjuntiva Prenex (CNF Prenex)**  
- **Forma Normal Disjuntiva Prenex (DNF Prenex)**  
- **Forma Cláusal**  
- **Cláusulas de Horn**

O sistema utiliza apenas **HTML, CSS e JavaScript puro**, sem bibliotecas externas de lógica. Para renderização matemática, é utilizada a biblioteca **MathJax**.

---

## 🛠 Estrutura dos Arquivos

### `index.html`
Arquivo principal que estrutura a aplicação:
- Campo de entrada (`textarea`) para digitação da fórmula em LaTeX.  
- Botão de transformação que aciona o motor lógico.  
- Exibição dos resultados passo a passo, com cada transformação apresentada em blocos diferenciados.  
- Seção de exemplos de fórmulas, que podem ser clicados para preencher automaticamente o campo de entrada.  
- Integração com **MathJax** para renderização matemática em tempo real:contentReference[oaicite:0]{index=0}.

---

### `MyMathLibFix2.js`
Biblioteca JavaScript responsável pelo **processamento lógico**:
- **Lexer e Parser (AST)**: interpreta fórmulas LaTeX em uma árvore sintática abstrata.  
- **Transformações Lógicas**:
  - Eliminação de equivalências (↔) e implicações (→).  
  - Conversão para **NNF** (Forma Normal Negativa).  
  - Padronização de variáveis (α-renomeação).  
  - Reordenação de quantificadores para forma **Prenex** (com miniscoping).  
  - **Skolemização** (eliminação de existenciais com funções de Skolem).  
  - Distribuição de conectivos para obtenção de **CNF** e **DNF**.  
- **Forma Cláusal**: extração de cláusulas a partir da CNF.  
- **Cláusulas de Horn**: verificação se as cláusulas obtidas obedecem às restrições de Horn.  
- **Tratamento de Erros**: mensagens de erro amigáveis para problemas de sintaxe ou fórmulas muito grandes:contentReference[oaicite:1]{index=1}.

---

### `MyMathStyleNew.css`
Folha de estilos responsável pela **estética e usabilidade**:
- Paleta de cores com gradientes modernos e suporte a **modo claro/escuro**.  
- Estilização de botões, caixas de entrada, blocos de resultados e exemplos clicáveis.  
- Layout responsivo para telas menores.  
- Destaque visual para cada etapa do processo (Original, CNF, DNF, Cláusulas, Horn).  
- Animações sutis para transições e foco em acessibilidade:contentReference[oaicite:2]{index=2}.

---

## 🚀 Como Executar
1. Baixe os três arquivos:
   - `index.html`
   - `MyMathLibFix2.js`
   - `MyMathStyleNew.css`

2. Certifique-se de que estejam na mesma pasta.

3. Abra o arquivo **`index.html`** em qualquer navegador moderno.

4. Digite ou selecione uma fórmula de exemplo no campo de texto.

5. Clique em **"Transformar Fórmula"** para visualizar todas as etapas de transformação.

---

## 🧪 Exemplos de Fórmulas
Alguns exemplos incluídos na aplicação:

```latex
\forall x \exists y (P(x) \implies Q(x,y)) \land R(x)

((P \leftrightarrow Q) \rightarrow R) \wedge \neg(R \rightarrow (P \vee Q))

\neg(\forall x \exists y\, P(x,y)) \vee \exists z \forall w\, Q(z,w)
