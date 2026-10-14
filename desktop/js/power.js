/* This file is part of Jeedom.
 *
 * Jeedom is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jeedom is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Jeedom. If not, see <http://www.gnu.org/licenses/>.
 */

/* global moment */

/**
 * Gestionnaire de la modal de puissance IoTaWatt
 */
if (typeof IotawattPowerModal === 'undefined') {
    var IotawattPowerModal = {};
}

IotawattPowerModal = {
    /**
     * Configuration
     */
    config: {
        selectors: {
            table: '#table_poweriotawatt',
            powerElements: '.cmd.power',
            consoElements: '.cmd.conso',
            powerSum: '.cmd.power[data-action="powerSum"]',
            consoTotY: '.cmd.consoTotY',
            consoTotT: '.cmd.consoTotT',
            consoTotPourcent: '.consoTotPourcent',
            historyElements: '.history',
            cmdAction: '.btn.cmdAction[data-action="configure"]',
            eqLogicAction: '.btn.eqLogicAction[data-action="configureEqLogic"]'
        }
    },

    /**
     * Initialisation
     */
    init() {
        this.setupPowerUpdateHandlers();
        this.setupConsoUpdateHandlers();
        this.setupEventHandlers();
        this.setupLinkyHandlers();
        this.updateUI();
    },

    /**
     * Met à jour la couleur de tendance d'un élément
     * @param {HTMLElement} element
     */
    updateTendanceClass(element) {
        const nextSibling = element.nextElementSibling;
        const previousSibling = element.previousElementSibling;
        
        element.classList.remove('redTendance', 'blueTendance', 'greenTendance');

        if (nextSibling) {
            if (nextSibling.classList.contains('fa-minus')) {
                element.classList.add('blueTendance');
            } else if (nextSibling.classList.contains('fa-arrow-down')) {
                element.classList.add('greenTendance');
            } else if (nextSibling.classList.contains('fa-arrow-up')) {
                element.classList.add('redTendance');
            }
        } else if (previousSibling) {
            const icon = previousSibling.querySelector('i');
            if (icon) {
                if (icon.classList.contains('fa-minus')) {
                    element.classList.add('blueTendance');
                } else if (icon.classList.contains('fa-arrow-down')) {
                    element.classList.add('greenTendance');
                } else if (icon.classList.contains('fa-arrow-up')) {
                    element.classList.add('redTendance');
                }
            }
        }
    },

    /**
     * Calcule la couleur en fonction du pourcentage
     * @param {number} pourcent
     * @returns {string}
     */
    getColorForPourcentage(pourcent) {
        if (isNaN(pourcent)) {
            return "hsl(0, 0%, 50%)";
        }

        const currentTimestamp = Math.floor(Date.now() / 1000);
        const startOfDayTimestamp = new Date().setHours(0, 0, 0, 0) / 1000;
        const endOfDayTimestamp = new Date().setHours(23, 59, 59, 999) / 1000;
        let percentOfDay = ((currentTimestamp - startOfDayTimestamp) / (endOfDayTimestamp - startOfDayTimestamp)) * 100;
        percentOfDay = Math.max(0, Math.min(100, percentOfDay));
        pourcent = Math.max(-200, Math.min(400, pourcent));

        let hue;
        let light = 30;

        if (pourcent < 0) {
            hue = 120 - percentOfDay * 1.2;
        } else {
            if (pourcent > 200) {
                hue = 0;
                light -= pourcent / 10;
            } else {
                hue = 0 + percentOfDay * 1.2;
            }
        }
        hue = Math.max(0, Math.min(120, 120 - hue));
        return `hsl(${hue}, 100%, ${light}%)`;
    },

    /**
     * Trie le tableau par puissance
     */
    sortTable() {
        const table = document.querySelector(this.config.selectors.table);
        if (!table) return;

        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        rows.sort((rowA, rowB) => {
            const cellA = rowA.cells[2];
            const cellB = rowB.cells[2];
            return this.extractNumericValue(cellB) - this.extractNumericValue(cellA);
        });

        rows.forEach(row => tbody.appendChild(row));
    },

    /**
     * Extrait la valeur numérique d'une cellule
     * @param {HTMLTableCellElement} cell
     * @returns {number}
     */
    extractNumericValue(cell) {
        const valueStr = cell.textContent.trim();
        const parts = valueStr.split(' ');
        let value = parseFloat(parts[0]);
        const unit = parts[1];
        
        if (unit === 'kWh' || unit === 'kW') {
            value *= 1000;
        }
        return value || 0;
    },

    /**
     * Met à jour la somme totale des puissances
     */
    updateTotalPowerSum() {
        let totalPower = 0;
        
        document.querySelectorAll(this.config.selectors.powerElements).forEach(elem => {
            const cmdId = elem.getAttribute('data-cmd_id');
            const isLinky = elem.getAttribute('data-linky') === '1';
            
            if (cmdId && !isLinky) {
                const valueStr = elem.textContent;
                let value = parseFloat(valueStr);
                const unit = valueStr.split(' ')[1];
                
                if (unit === 'kWh' || unit === 'kW') {
                    value *= 1000;
                }
                totalPower += value;
            }
        });

        const totalPowerElem = document.querySelector(this.config.selectors.powerSum);
        if (totalPowerElem) {
            totalPowerElem.textContent = `${totalPower.toFixed(0)} W`;
        }
    },

    /**
     * Met à jour la somme des consommations
     * @param {string} selector
     * @param {string} action
     */
    updateTotalConsoSum(selector, action) {
        let totalConso = 0;
        
        document.querySelectorAll(selector).forEach(elem => {
            const cmdId = elem.getAttribute('data-cmd_id');
            const isLinky = elem.getAttribute('data-linky') === '1';
            
            if (cmdId && !isLinky) {
                const valueStr = elem.textContent;
                let value = parseFloat(valueStr);
                const unit = valueStr.split(' ')[1];
                
                if (unit === 'kWh' || unit === 'kW') {
                    value *= 1000;
                }
                totalConso += value;
            }
        });

        let totalConsoUnit = 'Wh';
        if (totalConso > 1000) {
            totalConso /= 1000;
            totalConsoUnit = 'kWh';
        }

        const totalConsoElem = document.querySelector(`${selector}[data-action="${action}"]`);
        if (totalConsoElem) {
            totalConsoElem.textContent = `${totalConso.toFixed(2)} ${totalConsoUnit}`;
        }
    },

    /**
     * Met à jour le pourcentage de consommation totale
     */
    updateTotalConsoPourcent() {
        const yesterdayElem = document.querySelector('.cmd.consoTotY[data-action="totalYesterday"]');
        const todayElem = document.querySelector('.cmd.consoTotT[data-action="totalDay"]');
        
        if (!yesterdayElem || !todayElem) return;

        const consoYesterday = parseFloat(yesterdayElem.textContent);
        const consoToday = parseFloat(todayElem.textContent);
        
        if (isNaN(consoYesterday) || isNaN(consoToday) || consoYesterday === 0) return;

        const consoPourcent = (100 * consoToday / consoYesterday) - 100;
        const posConsoPourcent = consoPourcent > 0 ? `+${consoPourcent.toFixed(2)}` : consoPourcent.toFixed(2);
        
        const spanElem = document.querySelector('.consoTotPourcent[data-action="sum"]');
        if (spanElem) {
            spanElem.innerHTML = `<span class='label' style='background-color:${this.getColorForPourcentage(consoPourcent)} !important;'>${posConsoPourcent} %</span>`;
        }
    },

    /**
     * Met à jour le pourcentage de consommation Linky
     */
    updateLinkyConsoPourcent() {
        const yesterdayElem = document.querySelector('.consoTotY[data-linky="1"]');
        const todayElem = document.querySelector('.consoTotT[data-linky="1"]');
        
        if (!yesterdayElem || !todayElem) return;

        const consoYesterday = parseFloat(yesterdayElem.textContent);
        const consoToday = parseFloat(todayElem.textContent);
        
        if (isNaN(consoYesterday) || isNaN(consoToday) || consoYesterday === 0) return;

        const consoLinkyPourcent = (100 * consoToday / consoYesterday) - 100;
        const posConsoLinkyPourcent = consoLinkyPourcent > 0 ? `+${consoLinkyPourcent.toFixed(2)}` : consoLinkyPourcent.toFixed(2);
        
        const spanElem = document.querySelector('.consoTotPourcent[data-linky="1"]');
        if (spanElem) {
            spanElem.textContent = `${posConsoLinkyPourcent} %`;
            spanElem.style.backgroundColor = `${this.getColorForPourcentage(consoLinkyPourcent)} !important`;
        }
    },

    /**
     * Configure les gestionnaires de mise à jour de puissance
     */
    setupPowerUpdateHandlers() {
        document.querySelectorAll(this.config.selectors.powerElements).forEach(element => {
            const cmdId = element.getAttribute('data-cmd_id');
            if (!cmdId) return;

            jeedom.cmd.addUpdateFunction(cmdId, (options) => {
                element.setAttribute('title', `{{Date de collecte : }}${options.collectDate}<br/>{{Date de valeur : }}${options.valueDate}`);
                
                let displayValue = options.display_value;
                let unit = options.unit;
                
                if ((unit === 'Wh' || unit === 'W') && displayValue > 1000) {
                    displayValue /= 1000;
                    unit = `k${unit}`;
                }
                
                element.textContent = `${displayValue} ${unit}`;
                this.updateTendanceClass(element);
                this.updateUI();
            });
            
            this.updateTendanceClass(element);
        });
    },

    /**
     * Configure les gestionnaires de mise à jour de consommation
     */
    setupConsoUpdateHandlers() {
        document.querySelectorAll(this.config.selectors.consoElements).forEach(element => {
            const cmdId = element.getAttribute('data-cmd_id');
            if (!cmdId) return;

            jeedom.cmd.addUpdateFunction(cmdId, (options) => {
                element.setAttribute('title', `{{Date de collecte : }}${options.collectDate}<br/>{{Date de valeur : }}${options.valueDate}`);
                element.textContent = `${options.display_value} ${options.unit}`;
                this.sortTable();
            });
        });
    },

    /**
     * Configure les gestionnaires d'événements
     */
    setupEventHandlers() {
        const table = document.querySelector(this.config.selectors.table);
        if (!table) return;

        table.addEventListener('click', (event) => {
            // Historique
            if (event.target.matches(this.config.selectors.historyElements) || 
                event.target.closest(this.config.selectors.historyElements)) {
                event.stopImmediatePropagation();
                event.stopPropagation();
                
                const historyElem = event.target.closest(this.config.selectors.historyElements);
                let cmdIds;
                
                if (event.ctrlKey || event.metaKey) {
                    cmdIds = Array.from(historyElem.closest('div.eqLogic-widget')
                        .querySelectorAll('.history[data-cmd_id]'))
                        .map(cmd => cmd.getAttribute('data-cmd_id'))
                        .join('-');
                } else {
                    cmdIds = historyElem.getAttribute('data-cmd_id');
                }
                
	                jeeDialog.dialog({id: 'md_modal2', title: '{{Historique}}', contentUrl: `index.php?v=d&modal=cmd.history&id=${encodeURIComponent(cmdIds)}`});
                return;
            }

            // Configuration commande
            const cmdAction = event.target.closest(this.config.selectors.cmdAction);
            if (cmdAction) {
	                jeeDialog.dialog({id: 'md_modal2', title: '{{Configuration de la commande}}', contentUrl: `index.php?v=d&modal=cmd.configure&cmd_id=${encodeURIComponent(cmdAction.getAttribute('data-cmd_id'))}`});
                return;
            }

            // Configuration équipement
            const eqLogicAction = event.target.closest(this.config.selectors.eqLogicAction);
            if (eqLogicAction) {
	                jeeDialog.dialog({id: 'md_modal2', title: '{{Configuration de l\'équipement}}', contentUrl: `index.php?v=d&modal=eqLogic.configure&eqLogic_id=${encodeURIComponent(eqLogicAction.getAttribute('data-id'))}`});
                return;
            }
        });
    },

    /**
     * Configure les gestionnaires pour Linky
     */
    setupLinkyHandlers() {
        const totalConsoLinky = document.querySelector('.cmd.consoTotY[data-linky="1"]');
        if (!totalConsoLinky) return;

        const linkyConsoId = totalConsoLinky.getAttribute('data-cmd_id');
        if (!linkyConsoId) return;

        const currentDate = moment().format('YYYY-MM-DD HH:mm:ss');
        const todayMidnight = moment().startOf('day').format('YYYY-MM-DD HH:mm:ss');
        const yesterdayMidnight = moment().subtract(1, 'days').startOf('day').format('YYYY-MM-DD HH:mm:ss');

        jeedom.cmd.addUpdateFunction(linkyConsoId, () => {
            // Historique d'hier
            jeedom.history.get({
                cmd_id: linkyConsoId,
                dateStart: yesterdayMidnight,
                dateEnd: todayMidnight,
                success: (result) => {
                    totalConsoLinky.textContent = `${(result.maxValue - result.minValue).toFixed(2)} ${result.unite}`;
                }
            });

            // Historique d'aujourd'hui
            jeedom.history.get({
                cmd_id: linkyConsoId,
                dateStart: todayMidnight,
                dateEnd: currentDate,
                success: (result) => {
                    const todayElem = document.querySelector('.cmd.consoTotT[data-linky="1"]');
                    if (todayElem) {
                        todayElem.textContent = `${(result.maxValue - result.minValue).toFixed(2)} ${result.unite}`;
                    }
                    this.updateLinkyConsoPourcent();
                }
            });
        });

        jeedom.cmd.refreshValue([{cmd_id: linkyConsoId}]);

        // Gestionnaire pour la puissance Linky
        const totalPowerLinky = document.querySelector('.cmd.power[data-linky="1"]');
        if (totalPowerLinky) {
            const linkyPowerId = totalPowerLinky.getAttribute('data-cmd_id');
            if (linkyPowerId) {
                jeedom.cmd.addUpdateFunction(linkyPowerId, (options) => {
                    totalPowerLinky.textContent = `${options.display_value} ${options.unit}`;
                    totalPowerLinky.setAttribute('title', `{{Date de collecte : }}${options.collectDate}<br/>{{Date de valeur : }}${options.valueDate}`);
                });
            }
        }
    },

    /**
     * Met à jour toute l'interface
     */
    updateUI() {
        this.sortTable();
        this.updateTotalPowerSum();
        this.updateTotalConsoSum('.cmd.consoTotT', 'totalDay');
        this.updateTotalConsoSum('.cmd.consoTotY', 'totalYesterday');
        this.updateTotalConsoPourcent();
    },

    /**
     * Gère le toggle entre kWh et €
     */
    setupToggleSwitch() {
        const toggleContainer = document.getElementById('toggleValueType');
        if (!toggleContainer) {
            console.warn('Toggle container not found');
            return;
        }

        const checkbox = toggleContainer.querySelector('input[type="checkbox"]');
        if (!checkbox) {
            console.warn('Toggle checkbox not found');
            return;
        }

        const switchBg = toggleContainer.querySelector('div[style*="position: relative"]');
        const slider = switchBg ? switchBg.querySelector('span[style*="position: absolute"]') : null;
        
        if (!switchBg || !slider) {
            console.warn('Toggle elements not found');
            return;
        }

        const self = this;

        checkbox.addEventListener('change', function() {
            const showCost = this.checked;
            
            // Animer le toggle
            if (showCost) {
                slider.style.transform = 'translateX(26px)';
                switchBg.style.background = '#4a9eff';
            } else {
                slider.style.transform = 'translateX(0)';
                switchBg.style.background = '#ccc';
            }

            // Afficher/masquer les labels de coût et kWh
            document.querySelectorAll('.consoTotY').forEach(function(el) {
                el.style.display = showCost ? 'none' : 'inline-block';
            });
            
            document.querySelectorAll('.consoTotY-cost').forEach(function(el) {
                el.style.display = showCost ? 'inline-block' : 'none';
            });
            
            document.querySelectorAll('.consoTotT').forEach(function(el) {
                el.style.display = showCost ? 'none' : 'inline-block';
            });
            
            document.querySelectorAll('.consoTotT-cost').forEach(function(el) {
                el.style.display = showCost ? 'inline-block' : 'none';
            });

            // Recalculer les totaux en € si nécessaire
            if (showCost) {
                self.updateTotalCostSum('.consoTotT-cost', 'totalDay');
                self.updateTotalCostSum('.consoTotY-cost', 'totalYesterday');
            }
        });
    },

    /**
     * Met à jour la somme des coûts
     * @param {string} selector
     * @param {string} action
     */
    updateTotalCostSum(selector, action) {
        let totalCost = 0;
        
        document.querySelectorAll(selector).forEach(function(elem) {
            const cmdId = elem.getAttribute('data-cmd_id');
            const isLinky = elem.getAttribute('data-linky') === '1';
            
            if (cmdId && !isLinky) {
                const cost = parseFloat(elem.getAttribute('data-cost')) || 0;
                totalCost += cost;
            }
        });

        const totalCostElem = document.querySelector(selector + '[data-action="' + action + '"]');
        if (totalCostElem) {
            totalCostElem.textContent = totalCost.toFixed(2) + ' €';
        }
    }
};

// Initialisation au chargement du document
(function() {
    if (typeof IotawattPowerModal !== 'undefined' && IotawattPowerModal.init) {
        IotawattPowerModal.init();
        
        // Attendre que le DOM soit complètement chargé
        setTimeout(function() {
            IotawattPowerModal.setupToggleSwitch();
        }, 100);
    }
})();
