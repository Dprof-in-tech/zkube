import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/ui/elements/card";
import { useDojo } from "@/dojo/useDojo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faKhanda, faStar } from "@fortawesome/free-solid-svg-icons";
import { GameBonus } from "../containers/GameBonus";
import { Piece, Cell as CellType } from "@/types/types";
import Cell from "./Cell";
import { useMediaQuery } from "react-responsive";
import { useAccount } from "@starknet-react/core";
import { Account } from "starknet";

const PIECES: Piece[] = [
  { id: 1, width: 1, element: "stone1" },
  { id: 2, width: 2, element: "stone2" },
  { id: 3, width: 3, element: "stone3" },
  { id: 4, width: 4, element: "stone4" },
];

const GameBoard = ({
  initialGrid,
  nextLine,
  score,
  combo,
}: {
  initialGrid: number[][];
  nextLine: number[];
  score: number;
  combo: number;
}) => {
  const { account } = useAccount();
  const {
    setup: {
      systemCalls: { move },
    },
  } = useDojo();

  const [isLoading, setIsLoading] = useState(false);
  const [grid, setGrid] = useState<CellType[][]>([]);
  const stateGridRef = useRef(grid);
  const [isTxProcessing, setIsTxProcessing] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isFalling, setIsFalling] = useState(false);
  const [draggingPiece, setDraggingPiece] = useState<{
    row: number;
    col: number;
    startX: number;
    currentX: number;
    clickOffset: number;
  } | null>(null);
  const rows = 10;
  const cols = 8;
  const gridRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [bonusWave, setBonusWave] = useState(false);
  const [bonusTiki, setBonusTiki] = useState(false);
  const [bonusHammer, setBonusHammer] = useState(false);

  const isMdOrLarger = useMediaQuery({ query: "(min-width: 768px)" });

  useEffect(() => {
    setIsTxProcessing(false);
  }, [initialGrid]);

  useEffect(() => {
    if (isAnimating || isTxProcessing) return;
    initializeGrid(initialGrid);
  }, [initialGrid, isAnimating, isTxProcessing]);

  const printGrid = (grid: CellType[][]) => {
    for (const row of grid) {
      let rowStr = "";
      for (const cell of row) {
        if (cell.isStart) {
          rowStr += "[S] "; // S pour Start
        } else if (cell.pieceId !== null) {
          rowStr += `[${cell.pieceId}] `;
        } else {
          rowStr += "[ ] ";
        }
      }
      console.log(rowStr);
    }
  };

  const applyGravity = async () => {
    let changesMade = false;

    await new Promise((resolve) => {
      setGrid((prevGrid) => {
        const newGrid = prevGrid.map((row) => row.map((cell) => ({ ...cell })));
        changesMade = false;

        for (let row = rows - 2; row >= 0; row--) {
          for (let col = 0; col < cols; col++) {
            if (
              newGrid[row][col].pieceId !== null &&
              newGrid[row][col].isStart
            ) {
              const piece = PIECES.find(
                (p) => p.id === newGrid[row][col].pieceId,
              );
              if (piece) {
                let canFall = true;
                for (let i = 0; i < piece.width; i++) {
                  if (
                    col + i >= cols ||
                    newGrid[row + 1][col + i].pieceId !== null
                  ) {
                    canFall = false;
                    break;
                  }
                }
                if (canFall) {
                  // Déplacer la pièce d'une ligne vers le bas
                  for (let i = 0; i < piece.width; i++) {
                    newGrid[row + 1][col + i] = { ...newGrid[row][col + i] };
                    newGrid[row][col + i] = {
                      id: `${row}-${col + i}`,
                      pieceId: null,
                      isStart: false,
                      pieceIndex: null,
                    };
                  }
                  changesMade = true;
                }
              }
            }
          }
        }
        resolve(newGrid);
        return newGrid;
      });
    });

    return changesMade;
  };

  // Fonction pour appliquer la gravité en boucle tant qu'il y a des changements
  const applyGravityLoop = async () => {
    setIsAnimating(true);
    setIsFalling(true);

    let rowsCleared = true;
    while (rowsCleared) {
      let changesMade = true;
      while (changesMade) {
        changesMade = await applyGravity();
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      setIsFalling(false);

      await new Promise((resolve) => setTimeout(resolve, 200));
      rowsCleared = await checkAndClearFullLines();
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await new Promise((resolve) => setTimeout(resolve, 200));

    await insertNewLine();

    await new Promise((resolve) => setTimeout(resolve, 300));

    rowsCleared = true;
    while (rowsCleared) {
      let changesMade = true;
      while (changesMade) {
        setIsFalling(true);
        changesMade = await applyGravity();
        setIsFalling(false);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      rowsCleared = await checkAndClearFullLines();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (isGridEmpty(stateGridRef.current)) {
      handleEmptyGrid();

      await new Promise((resolve) => setTimeout(resolve, 200));

      await insertNewLine();

      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    setIsAnimating(false);
  };

  const checkAndClearFullLines = async () => {
    let rowsCleared = false;
    await new Promise((resolve) => {
      setGrid((prevGrid) => {
        const newGrid = prevGrid.map((row) => row.map((cell) => ({ ...cell })));

        for (let row = 0; row < rows; row++) {
          if (newGrid[row].every((cell) => cell.pieceId !== null)) {
            // Ligne complète, on la supprime
            rowsCleared = true;
            for (let i = row; i > 0; i--) {
              newGrid[i] = newGrid[i - 1].map((cell) => ({
                ...cell,
                id: `${i}-${cell.id.split("-")[1]}`,
              }));
            }
            // Vider la première ligne
            newGrid[0] = newGrid[0].map((cell, col) => ({
              id: `0-${col}`,
              pieceId: null,
              isStart: false,
              pieceIndex: null,
            }));
          }
        }

        resolve(newGrid);
        stateGridRef.current = newGrid;
        return newGrid;
      });
    });
    return rowsCleared;
  };

  const checkAndClearFullLinesFromBot = async () => {
    let rowsCleared = false;
    await new Promise((resolve) => {
      setGrid((prevGrid) => {
        const newGrid = prevGrid.map((row) => row.map((cell) => ({ ...cell })));

        for (let row = rows - 1; row >= 0; row--) {
          if (newGrid[row].every((cell) => cell.pieceId !== null)) {
            // Ligne complète, on la supprime
            rowsCleared = true;
            for (let i = row; i > 0; i--) {
              newGrid[i] = newGrid[i - 1].map((cell) => ({
                ...cell,
                id: `${i}-${cell.id.split("-")[1]}`,
              }));
            }
            // Vider la première ligne
            newGrid[0] = newGrid[0].map((cell, col) => ({
              id: `0-${col}`,
              pieceId: null,
              isStart: false,
              pieceIndex: null,
            }));
            break;
          }
        }

        resolve(newGrid);
        return newGrid;
      });
    });

    return rowsCleared;
  };

  const clearSelectedLine = async (selectedRow: number) => {
    await new Promise((resolve) => {
      setGrid((prevGrid) => {
        const newGrid = prevGrid.map((row) => row.map((cell) => ({ ...cell })));

        // Vérifier et supprimer tous les blocs assignés de la ligne sélectionnée
        if (selectedRow >= 0 && selectedRow < newGrid.length) {
          newGrid[selectedRow] = newGrid[selectedRow].map((cell, col) => ({
            id: `${selectedRow}-${col}`,
            pieceId: null,
            isStart: false,
            pieceIndex: null,
          }));
        }

        resolve(newGrid);
        return newGrid;
      });
    });
  };

  const insertNewLine = async () => {
    console.log("insertNewLine");
    await new Promise((resolve) => {
      setGrid((prevGrid) => {
        // Créez une nouvelle grille en décalant toutes les lignes vers le haut
        const newGrid = prevGrid.slice(1);

        // Créez la nouvelle ligne à partir de nextLine
        const newLine: CellType[] = nextLine.map((value, index) => ({
          id: `${rows - 1}-${index}`,
          pieceId: value !== 0 ? value : null,
          isStart: false,
          pieceIndex: null,
        }));

        // Ajoutez la nouvelle ligne en bas de la grille
        newGrid.push(newLine);

        // Mettez à jour les isStart pour la nouvelle ligne
        markStartingCells(newGrid);

        resolve(newGrid);

        return newGrid;
      });
    });
  };

  const loopGravityAndClear = async () => {
    applyGravityLoop();
  };

  const placePiece = (
    grid: CellType[][],
    row: number,
    col: number,
    piece: Piece,
  ) => {
    for (let j = 0; j < piece.width; j++) {
      grid[row][col + j].pieceId = piece.id;
      grid[row][col + j].isStart = j === 0;
      grid[row][col + j].pieceIndex = row * cols + col;
    }
  };

  const checkCollision = (
    row: number,
    startCol: number,
    endCol: number,
    piece: Piece,
  ) => {
    const direction = endCol > startCol ? 1 : -1;
    for (let col = startCol; col !== endCol; col += direction) {
      if (col < 0 || col + piece.width > cols) return true;
      const current: CellType = grid[row][col];
      const left: CellType = grid[row][col - 1];
      const right: CellType = grid[row][col + piece.width];
      if (
        direction === -1
          ? !!left?.pieceIndex && left.pieceIndex !== current.pieceIndex
          : !!right?.pieceIndex && right.pieceIndex !== current.pieceIndex
      ) {
        return true;
      }
    }
    return false;
  };

  function startDragging(rowIndex: number, colIndex: number, e: any) {
    if (isAnimating) return;
    const piece = PIECES.find((p) => p.id === grid[rowIndex][colIndex].pieceId);
    if (!piece) return;

    // Assurez-vous que nous commençons par la cellule de départ pour cette pièce
    let startCol = colIndex;
    while (
      startCol > 0 &&
      grid[rowIndex][startCol - 1].pieceId === piece.id &&
      !grid[rowIndex][startCol].isStart
    ) {
      startCol--;
    }

    const gridRect = gridRef.current?.getBoundingClientRect();
    const cellWidth = gridRect ? gridRect.width / cols : 0;
    const startX = gridRect ? gridRect.left + startCol * cellWidth : 0;

    // Calculez le décalage entre le point de clic et le début de la pièce
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clickOffset = clientX - startX;

    setDraggingPiece({
      row: rowIndex,
      col: startCol,
      startX: startX,
      currentX: startX,
      clickOffset: clickOffset,
    });
    setIsDragging(true);
  }

  function computeXAndDrag(e: any) {
    if (gridRef.current === null || draggingPiece === null) return;
    const gridRect = gridRef.current.getBoundingClientRect();
    const cellWidth = gridRect.width / cols;
    const piece = PIECES.find(
      (p) => p.id === grid[draggingPiece?.row][draggingPiece.col].pieceId,
    );
    if (!piece) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let newX = clientX - draggingPiece.clickOffset;

    const totalDrag = newX - draggingPiece.startX;

    // Calculez la nouvelle colonne
    let newCol = Math.round(draggingPiece.col + totalDrag / cellWidth);

    // Vérifiez les limites
    newCol = Math.max(0, Math.min(cols - piece.width, newCol));

    // Vérifiez les collisions sur tout le chemin
    if (!checkCollision(draggingPiece.row, draggingPiece.col, newCol, piece)) {
      // Si pas de collision, mettez à jour la position
      newX = draggingPiece.startX + (newCol - draggingPiece.col) * cellWidth;
      setDraggingPiece({ ...draggingPiece, currentX: newX });
    } else {
      // En cas de collision, trouvez la position valide la plus proche
      let validCol = draggingPiece.col;
      const direction = newCol > draggingPiece.col ? 1 : -1;
      while (
        validCol !== newCol &&
        !checkCollision(
          draggingPiece.row,
          draggingPiece.col,
          validCol + direction,
          piece,
        )
      ) {
        validCol += direction;
      }

      newX = draggingPiece.startX + (validCol - draggingPiece.col) * cellWidth;
      setDraggingPiece({ ...draggingPiece, currentX: newX });
    }
  }

  function setPieceToNewPositionAndTx() {
    if (gridRef.current === null || draggingPiece === null) return;
    const gridRect = gridRef.current.getBoundingClientRect();
    const cellWidth = gridRect.width / cols;
    const totalDrag = draggingPiece.currentX - draggingPiece.startX;
    const draggedCells = Math.round(totalDrag / cellWidth);

    const newCol = Math.max(
      0,
      Math.min(cols - 1, draggingPiece.col + draggedCells),
    );

    const newGrid = [...grid];

    const piece = PIECES.find(
      (p) => p.id === grid[draggingPiece.row][draggingPiece.col].pieceId,
    );
    if (
      piece &&
      !checkCollision(draggingPiece.row, draggingPiece.col, newCol, piece)
    ) {
      // Effacer l'ancienne position
      for (let i = 0; i < piece.width; i++) {
        const oldCol = draggingPiece.col + i;
        if (oldCol < cols) {
          newGrid[draggingPiece.row][oldCol] = {
            id: `${draggingPiece.row}-${oldCol}`,
            pieceId: null,
            isStart: false,
            pieceIndex: null,
          };
        }
      }

      // Placer à la nouvelle position
      const finalCol = Math.min(newCol, cols - piece.width);
      placePiece(newGrid, draggingPiece.row, finalCol, piece);
      setGrid(newGrid);
      if (draggingPiece.col !== finalCol) {
        loopGravityAndClear();
      }

      // Send move tx
      handleMove(rows - draggingPiece.row - 1, draggingPiece.col, finalCol);
    }

    setDraggingPiece(null);
    setIsDragging(false);
  }

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (isAnimating) return;
      if (isTxProcessing) return;
      if (!isDragging || !draggingPiece || !gridRef.current) return;

      computeXAndDrag(e);
    },
    [isDragging, draggingPiece, grid, cols],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isAnimating) return;
      if (isTxProcessing) return;
      if (!isDragging || !draggingPiece || !gridRef.current) return;
      computeXAndDrag(e);
    },
    [isDragging, draggingPiece, grid, cols],
  );

  const handleMouseEnd = useCallback(() => {
    if (isAnimating) return;
    if (!isDragging || !draggingPiece || !gridRef.current) return;

    setPieceToNewPositionAndTx();
  }, [isDragging, draggingPiece, grid, cols]);

  useEffect(() => {
    const gridElement = gridRef.current;

    if (gridElement) {
      gridElement.addEventListener("touchmove", handleTouchMove);
      gridElement.addEventListener("touchend", handleMouseEnd);

      return () => {
        gridElement.removeEventListener("touchmove", handleTouchMove);
        gridElement.removeEventListener("touchend", handleMouseEnd);
      };
    }
  }, [handleTouchMove, handleMouseEnd]);

  const handleMove = useCallback(
    async (rowIndex: number, startIndex: number, finalOndex: number) => {
      if (startIndex === finalOndex) return;
      if (isAnimating) return;
      if (!account) return;

      setIsLoading(true);
      setIsTxProcessing(true);
      try {
        await move({
          account: account as Account,
          row_index: rowIndex,
          start_index: startIndex,
          final_index: finalOndex,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [account],
  );

  const handleEmptyGrid = useCallback(async () => {
    //if (isAnimating) return;
    if (!account) return;

    setIsLoading(true);
    setIsTxProcessing(true);
    try {
      await move({
        account: account as Account,
        row_index: 0,
        start_index: 0,
        final_index: 0,
      });
    } finally {
      setIsLoading(false);
    }
  }, [account]);

  const handleMouseUp = useCallback(() => {
    if (isAnimating) return;
    if (!isDragging || !draggingPiece || !gridRef.current) return;

    setPieceToNewPositionAndTx();
  }, [isDragging, draggingPiece, grid, cols]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const initializeGrid = (initialGrid: number[][]) => {
    const newGrid: CellType[][] = [];

    for (let i = 0; i < rows; i++) {
      const row: CellType[] = [];
      for (let j = 0; j < cols; j++) {
        const value = initialGrid[i][j];
        row.push({
          id: `${i}-${j}`,
          pieceId: value !== 0 ? value : null,
          isStart: false,
          pieceIndex: null,
        });
      }
      newGrid.push(row);
    }
    markStartingCells(newGrid);
    setGrid(newGrid);
  };

  const isGridEmpty = (grid: CellType[][]) => {
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const value = grid[i][j];
        if (value.pieceIndex != null) return false;
      }
    }
    return true;
  };

  const markStartingCells = (grid: CellType[][]) => {
    for (let i = 0; i < rows; i++) {
      let j = 0;
      while (j < cols) {
        const currentPiece = grid[i][j].pieceId;
        if (currentPiece !== null) {
          const piece = PIECES.find((p) => p.id === currentPiece);
          if (piece) {
            // Marquer le début de la pièce
            const pieceIndex = i * cols + j;
            grid[i][j].isStart = true;
            grid[i][j].pieceIndex = pieceIndex;

            // Marquer le reste de la pièce comme non-début
            for (let k = 1; k < piece.width && j + k < cols; k++) {
              grid[i][j + k].isStart = false;
              grid[i][j + k].pieceIndex = pieceIndex;
            }

            // Sauter à la fin de cette pièce
            j += piece.width;
          } else {
            // Si la pièce n'est pas trouvée dans PIECES, traiter comme une seule cellule
            throw new Error(`Piece not found for id: ${currentPiece}`);
          }
        } else {
          grid[i][j].isStart = false;
          j++;
        }
      }
    }
  };

  const handleClickTest = () => {
    console.log(isGridEmpty(grid));
  };

  const handleBonusWaveClick = () => {
    setBonusWave(true);
  };

  const handleBonusTikiClick = () => {
    setBonusTiki(true);
  };

  const handleBonusHammerClick = () => {
    setBonusHammer(true);
  };

  const handleRowClick = (rowIndex: number) => {
    if (bonusWave) {
      checkAndClearSelectedLine(rowIndex);
      setBonusWave(false);
      applyGravityLoop();
    }
  };

  const handleCellClick = (rowIndex: number, colIndex: number) => {
    if (bonusTiki) {
      removePieceFromGridByCell(rowIndex, colIndex);
      setBonusTiki(false);
      applyGravityLoop();
    }
    if (bonusHammer) {
      removePieceFromGrid(rowIndex, colIndex);
      setBonusHammer(false);
      applyGravityLoop();
    }
  };

  const checkAndClearSelectedLine = async (selectedRow: number) => {
    await new Promise((resolve) => {
      setGrid((prevGrid) => {
        const newGrid = prevGrid.map((row) => row.map((cell) => ({ ...cell })));

        // Vérifier et supprimer tous les blocs assignés de la ligne sélectionnée
        if (selectedRow >= 0 && selectedRow < newGrid.length) {
          newGrid[selectedRow] = newGrid[selectedRow].map((cell, col) => ({
            id: `${selectedRow}-${col}`,
            pieceId: null,
            isStart: false,
            pieceIndex: null,
          }));
        }

        resolve(newGrid);
        return newGrid;
      });
    });
  };

  const removePieceFromGridByCell = async (
    rowIndex: number,
    colIndex: number,
  ) => {
    await new Promise((resolve) => {
      setGrid((prevGrid) => {
        const newGrid = prevGrid.map((row) => row.map((cell) => ({ ...cell })));

        // Vérifier que les indices sont valides
        if (
          rowIndex >= 0 &&
          rowIndex < newGrid.length &&
          colIndex >= 0 &&
          colIndex < newGrid[0].length
        ) {
          const pieceIdToRemove = newGrid[rowIndex][colIndex].pieceId;

          // Parcourir chaque cellule de la grille et supprimer les cellules appartenant à la pièce spécifiée
          for (let row = 0; row < newGrid.length; row++) {
            for (let col = 0; col < newGrid[row].length; col++) {
              if (newGrid[row][col].pieceId === pieceIdToRemove) {
                newGrid[row][col] = {
                  id: `${row}-${col}`,
                  pieceId: null,
                  isStart: false,
                  pieceIndex: null,
                };
              }
            }
          }
        }

        resolve(newGrid);
        return newGrid;
      });
    });
  };

  const removePieceFromGrid = async (rowIndex: number, colIndex: number) => {
    await new Promise((resolve) => {
      setGrid((prevGrid) => {
        const newGrid = prevGrid.map((row) => row.map((cell) => ({ ...cell })));

        // Vérifier que les indices sont valides
        if (
          rowIndex >= 0 &&
          rowIndex < newGrid.length &&
          colIndex >= 0 &&
          colIndex < newGrid[0].length
        ) {
          const pieceIdToRemove = newGrid[rowIndex][colIndex].pieceId;
          const pieceIndexToRemove = newGrid[rowIndex][colIndex].pieceIndex;

          // Parcourir chaque cellule de la grille et supprimer les cellules appartenant à la pièce spécifiée
          for (let row = 0; row < newGrid.length; row++) {
            for (let col = 0; col < newGrid[row].length; col++) {
              if (
                newGrid[row][col].pieceId === pieceIdToRemove &&
                newGrid[row][col].pieceIndex === pieceIndexToRemove
              ) {
                newGrid[row][col] = {
                  id: `${row}-${col}`,
                  pieceId: null,
                  isStart: false,
                  pieceIndex: null,
                };
              }
            }
          }
        }

        resolve(newGrid);
        return newGrid;
      });
    });
  };

  const isLineComplete = (row: any) => {
    return row.every((cell: CellType) => cell.pieceId !== null && !isFalling);
  };

  return (
    <>
      <Card
        className={`p-4 bg-secondary ${isTxProcessing || isAnimating ? "cursor-wait" : "cursor-move"}`}
      >
        <div
          className={`${isMdOrLarger ? "w-[413px]" : "w-[300px]"} mb-4 flex justify-start items-center`}
        >
          <GameBonus
            onBonusWaveClick={handleBonusWaveClick}
            onBonusTikiClick={handleBonusTikiClick}
            onBonusHammerClick={handleBonusHammerClick}
          />
          <div
            className={`flex grow ${isMdOrLarger ? "text-4xl" : "text-2xl"} sm:gap-2 gap-[2px] justify-end mx-2`}
          >
            {score}
            <FontAwesomeIcon icon={faStar} className="text-yellow-500 ml-2" />
          </div>
          <div
            className={`flex grow ${isMdOrLarger ? "text-4xl" : "text-2xl"} sm:gap-2 gap-[2px] justify-end mx-2`}
          >
            {combo}
            <FontAwesomeIcon icon={faKhanda} className="text-slate-500 ml-2" />
          </div>
        </div>
        <div className="bg-slate-800 relative">
          <div
            ref={gridRef}
            className={`${isMdOrLarger ? "w-[412px]" : "w-[300px]"} border-4 border-slate-800 grid grid-cols-8 grid-rows-10 gap-1`}
            style={{ position: "relative" }}
          >
            {/* Grille de fond */}
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <React.Fragment key={rowIndex}>
                {Array.from({ length: cols }).map((_, colIndex) => (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    className="h-8 w-8 sm:w-12 sm:h-12 bg-secondary relative"
                  ></div>
                ))}
              </React.Fragment>
            ))}

            {/* Pièces placées */}
            {grid.map((row, rowIndex) => {
              const complete = isLineComplete(row);
              return (
                <React.Fragment key={`piece-${rowIndex}`}>
                  {row.map((cell, colIndex) => (
                    <Cell
                      key={cell.id}
                      cell={cell}
                      rowIndex={rowIndex}
                      colIndex={colIndex}
                      isLineComplete={complete}
                      draggingPiece={draggingPiece}
                      gridRef={gridRef}
                      cols={cols}
                      rows={rows}
                      startDragging={startDragging}
                      handleRowClick={handleRowClick}
                      handleCellClick={handleCellClick}
                      isTxProcessing={isTxProcessing}
                      isAnimating={isAnimating}
                    />
                  ))}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </Card>
    </>
  );
};

export default GameBoard;
